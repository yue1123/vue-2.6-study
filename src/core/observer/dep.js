/* @flow */

import type Watcher from "./watcher";
import { remove } from "../util/index";
import config from "../config";

let uid = 0;

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// 相当于被观察者, 每一个属性都对应着一个dep
export default class Dep {
  static target: ?Watcher;
  id: number;
  // 里面存放的是所有依赖于这个属性的观察者,也就是watcher
  // 当当前dep(值)变化时,通过notify通知watcher重新计算
  // 该属性让dep 知道watcher的存在
  subs: Array<Watcher>;

  constructor() {
    this.id = uid++;
    this.subs = [];
  }

  // 是通过watcher.addDep 添加
  // 添加一个依赖
  addSub(sub: Watcher) {
    this.subs.push(sub);
  }

  // 移除一个依赖
  removeSub(sub: Watcher) {
    remove(this.subs, sub);
  }

  // 通过响应式属性的get调用dep.depend
  // 添加依赖
  depend() {
    if (Dep.target) {
      Dep.target.addDep(this);
    }
  }

  // 通过set 方法, 值变化时,调用dep notify 方法,遍历当前dep 所有的watcher,调用watcher的update方法
  notify() {
    // stabilize the subscriber list first
    const subs = this.subs.slice();
    if (process.env.NODE_ENV !== "production" && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id);
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update();
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
// target 静态属性
Dep.target = null;
console.log(Dep.target, 'Dep.target')
const targetStack = [];
// 往栈里面放一个 Watcher, 仅在 Watcher.prototype.get 方法调用是,该值才不为空,其他时候都是 undefined
export function pushTarget(target: ?Watcher) {
  targetStack.push(target);
  Dep.target = target;
  // console.log(target, "Dep.target");
}

// 弹出一个栈尾元素,然后把 stack 的最后一个元素赋给 Dep.target, 恢复上一个,变更前的 Dep.target
export function popTarget() {
  targetStack.pop();
  Dep.target = targetStack[targetStack.length - 1];
}
