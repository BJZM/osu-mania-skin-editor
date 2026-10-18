# order-service

**一句话职责：** 接受下单请求，校验并创建一笔订单，返回订单号与应付金额。

> 这是 `module-contract` 产出的一张**复合模块接口卡**示例。它钉住了模块的输入/输出/依赖/约束，实现方只对着这张卡写。

## 接口
- `createOrder(userId: string, items: Array<{productId: string, qty: number}>, couponCode?: string): Promise<Order>`
- **不变量**：总额 = Σ(单价 × 数量) − 优惠；应付金额不可为负。
- **错误模式**：`OutOfStockError` / `InvalidCouponError` / `UserNotFoundError`。

## 输入
- `userId: string`——**前置**：用户存在且已登录。
- `items[]`——**前置**：非空；每个商品库存充足。
- `couponCode?: string`——**前置**：可选；若给则必须有效。

## 输出
- 返回 `{ orderId, total, payable }`。
- **后置**：订单已落库，库存已扣减。

## 依赖模块
- `inventory`（接口 `reserve(productId, qty)`）——依赖的是 **seam**，可用不同 adapter 替换（如数据库实现 / 内存实现）。
- `coupon`（接口 `quote(code, amount)`）——**直接复用**，无需改动。
- `payment`（接口 `create(orderId, payable)`）——依赖 seam。

## 副作用 / 外部资源
- 写入 `orders` 表；扣减库存；可能创建 `payment` 记录。

## 非功能
- 超时 3s；幂等（用 client_token 去重）；并发下对同一用户/商品友好。

## 深度评估
- **接口够窄**：对外只暴露 1 个方法 + 简单参数。
- **删除测试**：删掉它，订单校验/库存/支付逻辑会散布到 3 个调用方——值得保留。
- **复合删测**：作为复合模块，其“校验→报价→扣库存→建支付”的编排约束会散到多个调用方——值得命名。
- 结论：**deep**，接口窄、行为深，复合模块成立。

## 复用状态
- implemented
