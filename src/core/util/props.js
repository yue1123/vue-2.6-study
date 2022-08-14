/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};
// 校验 Prop：默认值处理 => 响应式 => Prop 断言(required, 是否符合 type 设定)
// https://ustbhuangyi.github.io/vue-analysis/v2/reactive/props.html#%E5%88%9D%E5%A7%8B%E5%8C%96
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key]
  const absent = !hasOwn(propsData, key)
  let value = propsData[key]
  // 处理 Boolean 类型的prop 默认值
  // boolean casting
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  if (booleanIndex > -1) {
    // 如果propsData没有prop key 并且改prop 没有配置default属性，直接赋值false
    if (absent && !hasOwn(prop, 'default')) {
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // 举例：
      /**
       *
        export default {
          name: String,
          nickName: [Boolean, String]
        }
        这种情况，nickName既可以是 Boolean 又可以是 String，组件在被调用的时候，形式就可以有以下两种
        <com nick-name="nick-name" />
        或
        <com nick-name /> 这种形式的props会被转换成 <com nick-name="" />
        模版在线解析：LINK: https://vue-template-explorer.netlify.app/#%3Ccom%20nick-name%20%2F%3E
        function render() {
          with(this) {
            return _c('com', {
              attrs: {
                "nick-name": ""
              }
            })
          }
        }
        所以，需要对其进行判断，决定默认值
       *
       */
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 如果配置的 Props Type 中没有 String 类型，stringIndex 就会是-1，默认值就会赋予 true
      // 或者[Boolean,String]这种，Boolean 在 String前面，Boolean具有更高的优先级，booleanIndex < stringIndex满足，默认值就会赋予 true
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // 如果经过上面的步骤还是 undefined，说明父组件没有传递这个值，就尝试使用配置的默认值
  // check default value
  if (value === undefined) {
    //
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    // 转换成响应式
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // 在开发环境，如果 default 值是 array 或者 Object，没有使用函数来包裹，就报错，因为他们的默认值必须要返回一个工厂函数。
  // warn against non-factory defaults for Object & Array
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // 如果 propsData 保存的上一次的值也是 undefined，就返回上一次默认的 undefined
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 判断 default 是否是工厂函数，如果是，就返回工厂函数调用的返回值，否则就返回本身
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
// 断言一个 Prop
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 如果是一个必传的 Prop，没有传递，就抛出一个警告
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  // value 为空，且没有非必传
  if (value == null && !prop.required) {
    return
  }
  // 定义了 type，就进行 type断言
  let type = prop.type
  let valid = !type || type === true
  const expectedTypes = []
  if (type) {
    // 如果 type 不是一个数组，就转换成一个数组
    if (!Array.isArray(type)) {
      type = [type]
    }
    // 紧接着遍历 type，找到一个符合就停止
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i], vm)
      // 保存获取的真实 type
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  const haveExpectedTypes = expectedTypes.some(t => t)
  // value 都不符合 type，并且 type 存在有效值，就抛出警告
  if (!valid && haveExpectedTypes) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  // 如果设置了validator，调用validator，如果返回值是 false，就抛出警告
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol|BigInt)$/

function assertType (value: any, type: Function, vm: ?Component): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    try {
      valid = value instanceof type
    } catch (e) {
      warn('Invalid prop type: "' + String(type) + '" is not a constructor', vm);
      valid = false;
    }
  }
  return {
    valid,
    expectedType
  }
}

const functionTypeCheckRE = /^\s*function (\w+)/

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
// 获取构造函数类型
function getType (fn) {
  const match = fn && fn.toString().match(functionTypeCheckRE)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    isExplicable(typeof value) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${styleValue(value, expectedType)}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${styleValue(value, receivedType)}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

const EXPLICABLE_TYPES = ['string', 'number', 'boolean']
function isExplicable (value) {
  return EXPLICABLE_TYPES.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
