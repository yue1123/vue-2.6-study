/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

// 全局的组件 uid,用于组件自增 id
let uid = 0

/**
 * 初始化
 * @param {*} Vue vue 构造函数
 */
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    // 保存当前vm 实例
    const vm: Component = this;
    // a uid
    // 每个实例都有一个自增的uid
    vm._uid = uid++;

    // ======= 用于性能分析 ========
    let startTag, endTag;
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`;
      endTag = `vue-perf-end:${vm._uid}`;
      mark(startTag);
    }
    // ===========================

    // 一个标志避免 this本身被 observed
    // a flag to avoid this being observed
    vm._isVue = true;
    // merge options
    // 组件模式的options 合并逻辑
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options);
    } else {
      // 单例模式options合并逻辑
      console.log(vm.constructor, resolveConstructorOptions(vm.constructor));
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      );
    }
    /* istanbul ignore else */
    // 初始化proxy, 主要作用是代理模版语法中不认识的语法, 例如{{ Number(age) }}, 还有就是校验 以_和$开头的变量,是不是在 data中,是的话就报错
    // 开发环境
    if (process.env.NODE_ENV !== "production") {
      initProxy(vm);
    } else {
      // 生产环境
      vm._renderProxy = vm;
    }
    // 暴露真真的 vm 实例在vm._self上
    // expose real self
    vm._self = vm;
    // 初始化生命周期
    initLifecycle(vm);
    // 初始化事件
    initEvents(vm);
    // 初始化 render
    initRender(vm);
    // 调用 beforeCreate 生命周期钩子,表示组件正式进入运阶段
    callHook(vm, "beforeCreate");
    // 初始话 inject
    initInjections(vm); // resolve injections before data/props
    // 初始化props,methods,data,computed,以及watch
    initState(vm);
    initProvide(vm); // resolve provide after data/props
    callHook(vm, "created");

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      vm._name = formatComponentName(vm, false);
      mark(endTag);
      measure(`vue ${vm._name} init`, startTag, endTag);
    }
    // 如果提供了el, 调用$mount挂载组件
    if (vm.$options.el) {
      vm.$mount(vm.$options.el);
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 把组件的一些属性动态属性,保存在vm.$options中,访问速度可以更快
  // 代码小技巧: 用opts保存vm.$options的引用,通过opts来修改,避免直接用vm.$options 来修改可以简化代码,看着更简洁

  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 获取组件默认选项(全局的components: transition, keep-alive 全局的directives: model,show等...),以及用Vue.extend继承来的属性
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
