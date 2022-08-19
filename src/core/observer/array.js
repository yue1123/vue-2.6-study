/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

// 取到Array的原型,便于创建一个继承于Array属性的对象, 同时也便于取原始方法
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

// 需要拦截的可改变array数据的方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 拦截数组方法
// 通过自定义一个函数,在自定义函数中调用原本的方法, 触发更新,从而代替原本的数组方法, 使数组响应式
methodsToPatch.forEach(function (method) {
  // cache original method
  // 原本的方法
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    // 获取新插入的数据, 变成响应式数据
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 响应更新
    ob.dep.notify()
    // 返回数组原方法调用的返回值
    return result
  })
})
