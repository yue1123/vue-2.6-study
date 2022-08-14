# Observer 各个文件的作用

- array.js 创建含有重写数组方法的数组,让所有响应式数据数组都继承自该数组
- dep.js Dep 类
- index.js Observer 类, observer 的工厂函数
- scheduler.js Vue 中任务调度工具,watcher执行的核心
- traverse.js 递归遍历响应式数据,目的是触发依赖收集
- watcher.js Watcher 类

- Observer ===> 相当于被观察者,里面的deps记录了所有的 watcher(依赖),每一个属性都有一个对应的 dep,通过 Observe 生成, get 的时候收集依赖,set 的时候派发更新
- Watcher ===> 相当于观察者,分为三类, render watcher, computed watcher, watch watcher, watcher都提供一个update方法,当依赖变更时,由 dep.notify 来遍历 deps,调用 depItem(watcher)的update 方法来响应更新
  - render watcher对应的update方法就是 template render function
  - computed watcher 对应的update方法就是 getter fn ,隐形的依赖项,需要收集//(FIXME: 什么时候收集 computed 里面的依赖)
  - watch watcher 对应的 update 方法就是 watch callback,显性的指定依赖项