/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import { arrayMethods } from "./array";
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
} from "../util/index";

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  //
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    // 记录当前值
    this.value = value;
    this.dep = new Dep();
    this.vmCount = 0;
    def(value, "__ob__", this);
    // 如果value值是一个数组
    // TIPS:
    // Vue 中只会对数组中非原始数组代理,原始值不做处理
    if (Array.isArray(value)) {
      // 如果 __proto__ 可用,直接将拦截的 Array 方法赋给__proto__
      if (hasProto) {
        protoAugment(value, arrayMethods);
      } else {
        // 不能用__proto__的话,就把拦截的 Array 每一个方法赋给 array 本身
        // [
        //   0: '1',
        //   1: '2',
        //   length: 2,
        //   pop: xxx,
        //   push: xxx
        // ]
        copyAugment(value, arrayMethods, arrayKeys);
      }
      this.observeArray(value);
    } else {
      this.walk(value);
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]);
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}

/**
 * 尝试为属性值value创建一个observer
 * 如果成功observed,返回一个新的observer
 * 或者value已经有一个observer,则返回已经存在的observer
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
/**
 * 数据响应式入口函数
 * @param {*} value 需要被观察者的对象
 * @param {*} asRootData 仅data对象初始化观察者时,该值才为true
 */
export function observe(value: any, asRootData: ?boolean): Observer | void {
  // 如果value 不是一个对象或者value是VNode,直接返回
  // 只代理对象
  if (!isObject(value) || value instanceof VNode) {
    return;
  }
  let ob: Observer | void;
  // 如果已经存在__ob__ 属性,则说明已经是做过处理的,不在处理
  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    ob = value.__ob__;
  } else if (
    // 应该被观察flag,通过toggleObserving方法控制切换
    shouldObserve &&
    // 不是在服务端,因为服务端只是将数据初次渲染脱水,数据响应式处理没意义
    !isServerRendering() &&
    // 如果是数组或者对象
    (Array.isArray(value) || isPlainObject(value)) &&
    // 检查对象是否可以被添加新的属性
    // 例如 通过 Object.freeze() 冻结的对象就不会转换为响应式
    Object.isExtensible(value) &&
    // 不是vm(this)对象
    !value._isVue
  ) {
    // debugger
    ob = new Observer(value);
  }
  // 如果是data, 并且有ob, 则增加实例数
  if (asRootData && ob) {
    ob.vmCount++;
  }
  return ob;
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 定义一个 dep 对象,用于记录该属性所对应的watcher
  // const dep = new Dep();
  const dep = new Dep(key);

  /**
   * 获取对象指定属性的描述配置
   * {
   *    value: xxx,
   *    writable: true/false,
   *    enumerable: true/false,
   *    configurable: true/false
   * }
   */
  // 获取对象指定属性的描述配置
  const property = Object.getOwnPropertyDescriptor(obj, key);
  // 如果描述配置存在且不可配置,直接返回
  if (property && property.configurable === false) {
    return;
  }

  // cater for pre-defined getter/setters
  // 属性已有的 get
  const getter = property && property.get;
  // 属性已有的 set
  const setter = property && property.set;
  // 如果没有 getter 只有 setter, 且只传入了 obj和key, 没有提供 val,就从 obj 中取key的值
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  // 子属性响应式
  // 如果不是没有指定浅层响应式,就尝试将子属性也变为响应式
  let childOb = !shallow && observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val;
      // console.log(value,key,childOb)
      // Dep.target 是一个当前处在全局的活跃的 Watcher
      // get 触发依赖收集
      // eslint-disable-next-line no-debugger
      // debugger
      console.log('key',key,'===============')
      if (Dep.target) {
        console.log(Dep.target, dep,'收集的 dep')
        dep.depend();
        // 如果 value 是对象/数组, 也需要把 value 对应的 ob 添加为当前 Dep.target 的依赖, 当用户调用$set时,直接取到 childOb 的 dep, 调用 dep.notify 进行视图更新
        // 因为子属性任意一个更改,都应该更新视图
        if (childOb) {
          childOb.dep.depend();
          // 如果是数组,还需要将数组里面非原始值递归的添加依赖
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }
      return value;
    },
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val;
      /* eslint-disable no-self-compare */
      // 如果两个值相等, 或者值为 NAN, 直接返回
      // NaN === NaN  ===> false
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== "production" && customSetter) {
        customSetter();
      }
      // #7981: for accessor properties without setter
      // 如果没有setter,只有 getter, 直接返回
      if (getter && !setter) return;
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      // 如果设置的值是对象或者数组,还需要更新响应式数据,更新 childOb
      childOb = !shallow && observe(newVal);
      // 触发更新
      dep.notify();
    },
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  // 如果是一个数组,并且传入的 key 有效,设置后会触发数组重谢方法,进行更新
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 直接给一个数组设置长度, 如果大于数组当前长度,会扩充数组,并填充 empty item,如果小于数组当前长度,会从给定的长度处进行截取
    target.length = Math.max(target.length, key);
    // 再给指定的 index 插入元素
    // splice 是被重写了的 splice 方法,会触发更新
    target.splice(key, 1, val);
    return val;
  }
  // 如果 key 已经存在在 target 中,则直接  set会触发属性的响应式 set 方法
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }
  const ob = (target: any).__ob__;
  // 如果 target 是当前实例(this) 或者 通过 this.$data 和 this._data 添加属性,是不允许的行为
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid adding reactive properties to a Vue instance or its root $data " +
          "at runtime - declare it upfront in the data option."
      );
    return val;
  }
  // 如果没有 ob, 说明不是一个响应式属性,直接修改,无需更新
  if (!ob) {
    target[key] = val;
    return val;
  }
  // 如果有 ob,说明是响应式属性,通过defineReactive,想已有的 data中添加一个属性
  defineReactive(ob.value, key, val);
  // 更新
  ob.dep.notify();
  return val;
}

/**
 * 删除一个属性并触发更新
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid deleting properties on a Vue instance or its root $data " +
          "- just set it to null."
      );
    return;
  }
  if (!hasOwn(target, key)) {
    return;
  }
  delete target[key];
  if (!ob) {
    return;
  }
  ob.dep.notify();
}

/**
 *
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>) {
  console.log('dependArray',value)
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
