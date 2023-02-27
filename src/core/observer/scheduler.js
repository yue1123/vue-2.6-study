/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

// watcher 更新队列
const queue: Array<Watcher> = []
//
const activatedChildren: Array<Component> = []
// 保存调度器队列中现有的 watcher
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
// 重置调度器
function resetSchedulerState () {
  // 将queue 和 activatedChildren 数组清空,index重置为 0
  // TIPS: 设置数组长度为0,可以清空数组
  index = queue.length = activatedChildren.length = 0
  // 重置
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  // 设置当前刷新调度器时间戳
  currentFlushTimestamp = getNow()
  // 上锁
  flushing = true
  let watcher, id

  // 在刷新之前给队列排序
  // Sort queue before flush.
  // 这是为了确保:
  // This ensures that:
  // 1. 组件更新是由父组件到子组件(因为父组件总是在子组件之前被创建,watcher使用的是自增 id,越先创建id越小),所以更新的时候,应该先更新父组件,在更新子组件
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. 组件中用户创建的 watcher是先于组件的 render watcher
  //     init 时,先初始化用户的 watcher 和 computed, 最后初始化的 renderWatcher
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. 如果一个组件在父组件 watcher运行期间被销毁了,它的 watchers 应该跳过
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 将队列中的 watcher 按从小到大的顺序排序
  queue.sort((a, b) => a.id - b.id)
  // 不要缓存数组的 length, 因为更多的 watchers 可能被 push 进来,当我们运行队列中观察者时
  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    // 如果 watcher 有 before 生命周期回调, 就调用
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    // 重置 has map中标识的 watcher id
    has[id] = null
    // 调用 watcher.run(), 计算 watcher 的值
    watcher.run()
    // flush 过程中,队列是可能会新增,如果新增时判断到已经更新过一次了,记录数就+1,超过 100 次,就被视为循环更新
    // 在开发环境中,检查并停止循环更新
    // 如果我们在 watch:{
    //    name:function(){
    //      this.name = Math.random()
    //    }
    // }
    // 就会触发循环更新
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }


  // copy 副本,便于遍历调用 hooks
  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  resetSchedulerState()

  // 统一调用hooks
  // call component updated and activated hooks
  // 重新激活 keep-alive 组件
  callActivatedHooks(activatedQueue)
  // 调用组件 update 生命周期
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // 如果组件当前的 watcher 和队列 watcher 相同,并且是挂载后的组件,不是已经被销毁的组件,就调用 update hook
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
// keep-alive 的组件重新激活后, 入队列等待更新调用
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  // 如果当前 watcher.id 不存在 watcher map 中
  if (has[id] == null) {
    // 缓存当前 watcher.id,避免相同的 watcher 再次入队
    has[id] = true
    // 如果没有在更新中,就入队
    if (!flushing) {
      queue.push(watcher)
    } else {
      // 如果正在更新中,就找到队列中小于等于当前 watcher.id 的索引,在后面插入 watcher,便于下次立即运行
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      // i > index(当前正在执行的 watcher index): 刷新还没有结束,没有遍历到最后一个
      // queue[i].id > watcher.id 为了找watcher插入索引位置
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // 缓冲队列更新
    // 如果当前不是等待更新中,就开启一个缓存队列,等待 nextTick 触发刷新
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue)
    }
  }
}
