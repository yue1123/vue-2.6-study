/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// 这是一个动态的值, 全局只有一个,因为 js是单线程, 同一时间只能初始化一个组件 Watcher
// FIXME: 模版里面有子组件的情况怎样处理??
// 答案就是用一个栈来存起来
// 当页面中有子组件时,全局的 watcher (也就是 Dep.target)会一直变,子组件 Watcher 会覆盖父级组件 Watcher,所以用一个栈来存起来,子组件完了能恢复父组件的 Watcher 引用
// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []
// 往栈里面放一个 Watcher
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
  console.log(target)
}

// 弹出一个栈尾元素,然后把 stack 的最后一个元素赋给 Dep.target, 恢复上一个,变更前的 Dep.target
export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
