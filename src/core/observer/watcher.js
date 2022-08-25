/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop,
} from "../util/index";

import { traverse } from "./traverse";
import { queueWatcher } from "./scheduler";
import Dep, { pushTarget, popTarget } from "./dep";

import type { SimpleSet } from "../util/index";

let uid = 0;

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
// FIXME: watcher 优先级??
// 1. 几种 watcher 的优先级 ?
// 相当于观察者
export default class Watcher {
  // 实例
  vm: Component;
  // 回调函数字符串形式
  expression: string;
  // 回调
  cb: Function;
  // id
  id: number;
  // 是否深度递归监听
  deep: boolean;
  // 是否时用户自定义watcher,一般是watch 监听
  user: boolean;
  // 是否懒更新,一般是computed 属性
  lazy: boolean;
  // 是否同步
  sync: boolean;
  // 脏标识, 标识该watcher 的值已经不是新的了, 但是还没有主动触发计算函数, 未更新状态, 配合lazy使用
  dirty: boolean;
  active: boolean;
  // 保存了当前watcher所有的依赖,他们中任意一个值改变,改watcher都会重新计算
  // 该属性将watcher和dep关联起来,让watcher 知道dep 的存在
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  // 生命周期回调, 会在调用该 watcher 之前调用
  before: ?Function;
  getter: Function;
  value: any;

  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm;
    if (isRenderWatcher) {
      vm._watcher = this;
    }
    // 把每个watcher 实例放到_watchers中
    vm._watchers.push(this);
    // options
    if (options) {
      this.deep = !!options.deep;
      this.user = !!options.user;
      this.lazy = !!options.lazy;
      this.sync = !!options.sync;
      this.before = options.before;
    } else {
      // 没有传options,他们的默认值都是false
      this.deep = this.user = this.lazy = this.sync = false;
    }
    this.cb = cb;
    this.id = ++uid; // uid for batching
    this.active = true;
    this.dirty = this.lazy; // for lazy watchers
    this.deps = [];
    this.newDeps = [];
    this.depIds = new Set();
    this.newDepIds = new Set();
    this.expression =
      process.env.NODE_ENV !== "production" ? expOrFn.toString() : "";
    // parse expression for getter
    if (typeof expOrFn === "function") {
      this.getter = expOrFn;
    } else {
      this.getter = parsePath(expOrFn);
      if (!this.getter) {
        this.getter = noop;
        process.env.NODE_ENV !== "production" &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              "Watcher only accepts simple dot-delimited paths. " +
              "For full control, use a function instead.",
            vm
          );
      }
    }
    this.value = this.lazy ? undefined : this.get();
    console.log(this.value, this.getter, '==================')
  }

  /**
   * 计算 getter, 并重新收集依赖
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    pushTarget(this);
    let value;
    const vm = this.vm;
    try {
      value = this.getter.call(vm, vm);
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`);
      } else {
        throw e;
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value);
      }
      popTarget();
      this.cleanupDeps();
    }
    return value;
  }

  /**
   * Add a dependency to this directive.
   */
  // 向dep中添加watcher
  addDep(dep: Dep) {
    const id = dep.id;
    console.warn(
      "🚀 --------------------------------------------------------------------------------🚀"
    );
    console.warn(
      "🚀 ~ file: watcher.js ~ line 148 ~ Watcher ~ addDep ~ this.newDeps",
      this.newDeps
    );
    console.warn(
      "🚀 --------------------------------------------------------------------------------🚀"
    );
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id);
      this.newDeps.push(dep);
      if (!this.depIds.has(id)) {
        dep.addSub(this);
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length;
    while (i--) {
      const dep = this.deps[i];
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this);
      }
    }
    let tmp = this.depIds;
    this.depIds = this.newDepIds;
    this.newDepIds = tmp;
    this.newDepIds.clear();
    tmp = this.deps;
    this.deps = this.newDeps;
    this.newDeps = tmp;
    this.newDeps.length = 0;
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 订阅者接口
   * 在依赖改变时会被调用
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      // 如果手动设置 lazy, lazy 不会自动计算, 需要手动调用evaluate来计算求值
      this.dirty = true;
    } else if (this.sync) {
      // 在服务端渲染情况下
      this.run();
    } else {
      // 正常情况下, 就将更新任务入队,缓冲等待 nextTick 调用
      queueWatcher(this);
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    if (this.active) {
      const value = this.get();
      if (
        // 如果两次 value 相同
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        // 旧值
        const oldValue = this.value;
        // 新值
        this.value = value;
        // 如果时用户自定义的watcher, 调用回调时,需要错误捕获
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`;
          invokeWithErrorHandling(
            this.cb,
            this.vm,
            [value, oldValue],
            this.vm,
            info
          );
        } else {
          this.cb.call(this.vm, value, oldValue);
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate() {
    this.value = this.get();
    this.dirty = false;
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  // 将该实例watcher的所有deps添加到当前活跃的Dep.target中
  depend() {
    let i = this.deps.length;
    while (i--) {
      console.log(this.deps[i]);
      this.deps[i].depend();
    }
  }

  /**
   * 从依赖列表中移除该watcher
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this);
      }
      let i = this.deps.length;
      while (i--) {
        this.deps[i].removeSub(this);
      }
      this.active = false;
    }
  }
}
