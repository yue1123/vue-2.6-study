/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'
// 是否使用的是微任务 flag
export let isUsingMicroTask = false

// nextTick 中缓冲的所有回调
const callbacks = []
// 执行 callbacks 任务是否正在进行中
let pending = false

// 清空callbacks
function flushCallbacks () {
  pending = false
  // 先 copy 一份callbacks
  const copies = callbacks.slice(0)
  // 然后清空 callbacks
  // >>> 我想应该是避免再执行回调时,回调中包含新的回调,动态的改变了 callbacks, 所以复制一份,
  // >>> 新进来的回调放到 callbacks中,等待下一次 nextTick 调用
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// 2.5 中,使用宏任务结合微任务
// In 2.5 we used (macro) tasks (in combination with microtasks).
// 然而, 在重绘之前更改 state 会出现微妙的问题
// However, it has subtle problems when state is changed right before repaint
// 例如: 问题#6813, out-in transitions
// (e.g. #6813, out-in transitions).
// 此外,在事件处理函数中使用宏任务, 会导致一些奇怪的行为
// Also, using (macro) tasks in event handler would cause some weird behaviors
// 都无法绕过
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// 所以我们现在再次在任何地方使用微任务。
// 这种权衡的一个主要缺点是，在某些情况下，微任务的优先级太高，并且据称介于两者之间
// So we now use microtasks everywhere, again.
// A major drawback of this trade off is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
// 如果 Promise 不是 undefined 并且是原生提供的 Promise, 就用 Promise.resolve() 微任务调度
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 创建一个fulfilled Promise
  const p = Promise.resolve()
  timerFunc = () => {
    // 每次调用 timerFunc, 通过.then 函数生成一个微任务
    p.then(flushCallbacks)
    // 在有问题的 UIWebViews 中，Promise.then 并没有完全中断，
    // 但它可能会陷入一种奇怪的状态，即回调被推入微任务队列但队列没有被刷新，
    // 直到浏览器需要做一些其他工作，例如处理一个计时器。
    // 因此，我们可以通过添加一个空计时器来“强制”刷新微任务队列。
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  // 不是 IE 并且有 MutationObserver, 并且是原生的MutationObserver
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // 当原生 Promise 不支持的时候,就是用 MutationObserver
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // Ie 11 不支持 MutationObserver
  // (#6466 MutationObserver is unreliable in IE11)
  // MutationObserver 主要用于监听 Dom 节点变化
  // 而此处通过创建一个文本节点, 然后每次调用 timerFunc 的时候,
  // 通过变化 counter 交替变化 0/1 来触发 Dom 节点变化引起的
  // MutationObserver 回调触发, 执行flushCallbacks
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 降级使用 setImmediate
  // 虽然他也是使用的宏任务队列,但是他任然是比 setTimeout 更好的选择
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // 降级使用 setTimeout
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick (cb?: Function, ctx?: Object) {
  // 主要的工作就是, 判断有 callback 没,有就直接放入 callbacks中,
  // 没有就返回一个 Promise,并且把 Promise 的 resolve函数放到 callbacks中
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    // 执行 timerFunc
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
