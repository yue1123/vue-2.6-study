/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 代理属性,可直接通过this访问
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
// 初始化props,methods,data,computed,以及watch
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 先初始化 props
  // 遍历 props ==> 默认值处理 ==> 响应式处理 ==> 生产环境断言警告
  if (opts.props) initProps(vm, opts.props)
  // 初始化 methods
  if (opts.methods) initMethods(vm, opts.methods)
  // 初始化 data
  if (opts.data) {
    initData(vm)
  } else {
    // 如果没有设定 data, 就传入一个空对象, 构成一个空的响应式系统
    observe(vm._data = {}, true /* asRootData */)
  }
  // computed 基于 watcher 独立存在的,
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  // propsData 记录了父组件向子组件传的值
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // 缓存 prop 键，以便将来的 props 更新可以使用 Array 进行迭代，而不是动态对象键枚举。
  const keys = vm.$options._propKeys = []
  // 没有$parent 说明是根组件
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // console.log(props, key, value);
      // 将props中的属性定义成响应式的
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 将_props 属性代理到 vm 实例上,使得不需要 this._props.xxx 访问,只需要 this.xxx访问
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 如果 data 是函数,但是返回值不是一个对象的话,
  // 就手动赋值空对象,并在开发环境给出警告
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // 如果 data 中定义的属性,props 中也有,生产环境给出警告
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {   // 判断data命名是否规范,非 _和$开头的data属性,才代理
      proxy(vm, `_data`, key)
    }
  }
  // 将data转换成响应式
  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  // 创建一个用于保存所有computed watchers的map
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  // 计算属性只是 SSR 期间的 getter
  const isSSR = isServerRendering()

  // 遍历computed
  for (const key in computed) {
    // 取出每一项
    const userDef = computed[key]
    // 获取getter
    // 应为computed 有两种形式
    /**
     * 形式一:
     * nickName(){
     *    return xxx
     * }
     */
    /**
     * 形式二
     * nickName:{
     *    set(){}
     *    get(){
     *        return xxx
     *    }
     * }
     */
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    // 如果没有设置getter,或者getter无效,则在生产环境中给出警告
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    // 
    if (!isSSR) {
      // create internal watcher for the computed property.
      // 为每个 computed 属性创建 watcher
      watchers[key] = new Watcher(
        vm,
        // getter 无效,watcher 求值函数就使用一个空函数
        getter || noop,
        noop,
        // lazy watcher
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 判断key是否在当前实例上,没有才定义
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 在当前实例上的话, 他就很可能来自data,props,methods中,所以分别判断,给出警告
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(`The computed property "${key}" is already defined as a method.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 不是在服务端才缓存computed值
  const shouldCache = !isServerRendering()
  // 如果computed 是函数形式
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
    // 缓存的话就走watcher
      ? createComputedGetter(key)
      // 不缓存的话就直接调用.每次视图渲染,触发重新调用函数,无异于methods
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 如果不是函数,尝试使用.get属性, 如果没有设置.get, 则设置一个空函数
    sharedPropertyDefinition.get = 
    userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  // 创建一个computed getter,在访问该getter属性时,触发该函数,将其添加到
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // lazy watcher 的作用:
      // 1. 懒更新
      // 2. 值缓存
      // 前面初始化computedWatcher时候, 标识了watcher lazy:true,
      // 所以watcher更新时,不会自动求值, 只是标识该watcher.dirty 为true
      // 此时的watcher value已经不是最新值了,当下次访问该属性的时候(例如视图渲染中用到了计算属性), 需要调用watcher.evaluate 来求值更新
      // 同时也通过该属性实现了计算属性的缓存
      // watcher.dirty 为true, 求值更新

      // 问题一: computed 是如何收集依赖的
      // computed 属性 实际上是一个Lazy watcher, 在初始化该watcher 时,是不会自动求值的,只标识watcher.dirty为true.
      // 只有当视图访问computed 属性时, 才会触发computedGetter函数, 从而触发computed watcher的evaluate求值函数, 该函数调用watcher.get,
      // 通过pushTarget, 将全局的Dep.target 指向该watcher, 于是,求值过程中,访问到的属性,都会触发get,然后将属性添加到该watcher的deps中,实现依赖收集

      // 问题二: computed 属性的依赖变化,是如何触发视图重新渲染的 ???
      // computed watcher在计算求值后,就收集了所有该watcher关联的依赖, 同时全局的Dep.target指向renderWatcher,
      // 这时候调用computedWatcher.depend 方法,将computedWatcher的所有依赖添加到renderWatcher 依赖中, 于是, computedWatcher的依赖变化时(dirty属性也会变成true),
      // 就会通知视图从新渲染, 视图渲染又会触发computedGetter, 从而触发computedWatcher.evaluate重新求值, 然后渲染到视图中
      if (watcher.dirty) {
        watcher.evaluate();
      }
      // 如果当前Dep.target 存在的话, 将
      if (Dep.target) {
        // console.warn("🚀 ------------------------------------------------------------------------🚀")
        // console.warn("🚀 ~ file: state.js ~ line 309 ~ computedGetter ~ Dep.target", Dep.target)
        // console.warn("🚀 ------------------------------------------------------------------------🚀")
        // console.log(Dep.target);
        // console.log(watcher.deps, 'watcher.deps');
        // debugger
        //
        watcher.depend();
      }
      // console.warn("🚀 ------------------------------------------------------------------------------🚀")
      // console.warn("🚀 ~ file: state.js ~ line 319 ~ computedGetter ~ watcher.value", watcher.value)
      // console.warn("🚀 ------------------------------------------------------------------------------🚀")
      return watcher.value;
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // 如果methods 不是一个函数,给出警告
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      // 判断 methods 中的方法是否在 props 中定义了
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      // 检查 methods 是否是 Vue 实例上面定义过的方法 并且 以$ 或者 _ 线命名
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // methods 上的方法挂载到vm实例上面, 通过 this可以直接访问
    // 如果 method 类型函数,就赋值一个空函数,避免报错
    // 如果是函数,就绑定this指向 vm
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key];

    /**
     * 常规的
     * name(){}
     */
    /**
     * 字符串,vm实例上的一个方法名
     * methods: {
          watchHandler(){
            console.log('我是watch handler');
          }
        },
        watch: {
          name: 'watchHandler'
        },
     */
    /**
     * watch属性支持数组
     * name: [
            function(){},
            function(){},
          ]
     */

    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 如果watch是一个配置对象
  if (isPlainObject(handler)) {
    // options 就是 options
    options = handler
    // 取出handler
    handler = handler.handler
  }
  // 如果 handler 是一个string, 因为watch 回调函数可以指定vm实例上的一个方法
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this;
    // 应为可以指定为字符串, 所有很有可能是vm实例上的一个对象,所以要对其进行重新调用createWatcher判断处理,
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options);
    }
    options = options || {};
    options.user = true;
    const watcher = new Watcher(vm, expOrFn, cb, options);
    // 如果不是立即执行回调函数, 就会等到所监听的值发生改变时,再触发
    // 如果时立即执行watcher
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`;
      pushTarget();
      // cb 就是回调函数
      // vm 就是实例
      // [watcher.value] 回调函数的参数
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info);
      popTarget();
    }
    // 由用户自己通过$watch创建的监听,提供手动销毁方法
    return function unwatchFn() {
      watcher.teardown();
    };
  }
}
