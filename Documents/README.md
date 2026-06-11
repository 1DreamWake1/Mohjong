# 在线麻将项目文档索引

当前文档按七个主题组织：

1. 需求
2. 架构设计
3. 技术路线
4. 开发计划
5. 环境准备
6. 阶段运行手册
7. 规则说明

## 1. 需求

主文档：

- [requirements.md](./requirements.md)
- [simple-rules.md](./simple-rules.md)

说明：

- 定义产品目标。
- 定义初期范围。
- 定义用户角色。
- 定义管理员账号、玩家账号、电脑玩家需求。
- 定义标准麻将规则和后续地方规则扩展需求。
- 定义当前快速对局的简单规则基线。
- 定义前端、服务端、数据库和整体验收标准。

当前关键结论：

- 初期不做广告、充值、用户自助注册和高并发。
- 玩家账号由管理员创建。
- 初期使用标准麻将规则。
- 当前快速对局使用万/筒/条、不吃、可碰杠胡的简单规则。
- 后续支持四川麻将、禁用“吃”等规则扩展。
- 支持 PC 和移动端浏览器访问。
- 初期先在本地和 Ubuntu 虚拟机中测试。

## 2. 架构设计

主文档：

- [architecture-design.md](./architecture-design.md)

说明：

- 定义系统整体架构。
- 定义前端、服务端、数据库、麻将核心算法、电脑玩家模块之间的关系。
- 定义玩家视角数据隔离。
- 定义本地开发和 Ubuntu 虚拟机测试架构。
- 定义后续扩展方向。

当前关键结论：

- 使用单体服务架构，不做微服务。
- 麻将核心算法独立为 `mahjong-core` 包。
- 服务端负责规则调用、状态管理和玩家视角过滤。
- 前端只负责显示和提交用户操作，不做最终规则裁决。
- 初期数据库使用 SQLite。

## 3. 技术路线

主文档：

- [technical-architecture.md](./technical-architecture.md)

说明：

- 定义前端、服务端、数据库、实时通信和部署技术选型。
- 对比 Node.js 与 Go、SQLite 与 PostgreSQL、React 与 Vue。
- 给出推荐技术栈和原因。

当前推荐技术栈：

```text
前端：React + TypeScript + Vite
服务端：Node.js + TypeScript + Fastify
实时通信：Socket.IO
数据库：SQLite
ORM：Prisma
核心算法：独立 TypeScript 包
本地开发：Ubuntu 虚拟机 + Node.js + SQLite
Linux 测试部署：Ubuntu 虚拟机 + Docker Compose + SQLite
后续部署：Docker Compose 为主，按需接入 PostgreSQL + Nginx/Caddy
```

## 4. 开发计划

主文档：

- [development-plan.md](./development-plan.md)

说明：

- 按阶段列出开发目标、功能点、输出物和验收标准。

当前阶段划分：

0. 项目初始化。
1. 完成麻将核心玩法算法和电脑玩家算法验证。
2. 完成服务端基础搭建、账号管理模块、登录前端和管理员用户管理页面。
3. 完成玩家入口页面、前端路由和体验完善。
4. 完成麻将游戏前端显示画面。
5. 合并麻将游戏核心业务算法，形成完整闭环。
6. 完善快速对局简单规则。
7. 增加对局记录和事件持久化。
8. 增加历史对局查询 API。
9. 增加前端历史对局页面。
10. 增强历史对局筛选和检索。
11. 增强历史调试详情。
12. 增加历史事件回放控件。
13. 增加完整牌桌状态快照回放。
14. 完善真实多人房间。
15. 增强进行中牌局恢复和房间生命周期。
16. 增强规则配置化。
17. 增加管理员对局后台。
18. 完善 Docker 部署和长期运行能力。

当前状态：阶段 13 已完成，阶段 14 正在开发；已完成房间大厅、等待室广播、准备、等待/已结束房间退出、开始房间、Bot 补位、真实牌局创建、多人玩家视角同步和牌局结束后房间状态同步基础，后续重点补齐进行中退出/重连/原房间再开局生命周期、牌局恢复、地方规则和 Docker 长期运行能力。

## 5. 环境准备

主文档：

- [environment-setup.md](./environment-setup.md)

说明：

- 汇总 Ubuntu 26.04 开发、测试和本地部署所需依赖。
- 记录系统包、Node.js/pnpm、数据库工具和可选部署组件。
- 给出 pnpm、SQLite、端口和防火墙配置建议。

## 6. 阶段运行手册

主文档：

- [phase-2-runbook.md](./phase-2-runbook.md)

说明：

- 记录第二阶段账号管理闭环的数据库初始化、管理员初始化、开发服务启动和浏览器验证步骤。
- 说明 Ubuntu 虚拟机中前后端访问地址和代理注意事项。

## 7. 规则说明

主文档：

- [simple-rules.md](./simple-rules.md)

说明：

- 固定当前快速对局规则范围。
- 明确自摸、点炮、流局、碰杠流转和简单结算验收标准。

## 8. 历史参考文档

以下文档为前期讨论沉淀，后续可以作为参考，不作为当前主线入口：

- [initial-local-test-requirements-and-development-plan.md](./initial-local-test-requirements-and-development-plan.md)
- [online-mahjong-architecture-and-development-plan.md](./online-mahjong-architecture-and-development-plan.md)

后续如果文档继续扩展，建议优先更新七个主文档：

- `requirements.md`
- `architecture-design.md`
- `technical-architecture.md`
- `development-plan.md`
- `environment-setup.md`
- `phase-2-runbook.md`
- `simple-rules.md`
