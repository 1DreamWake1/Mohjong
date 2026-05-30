# 在线麻将项目文档索引

当前文档按六个主题组织：

1. 需求
2. 架构设计
3. 技术路线
4. 开发计划
5. 环境准备
6. 阶段运行手册

## 1. 需求

主文档：

- [requirements.md](./requirements.md)

说明：

- 定义产品目标。
- 定义初期范围。
- 定义用户角色。
- 定义管理员账号、玩家账号、电脑玩家需求。
- 定义标准麻将规则和后续地方规则扩展需求。
- 定义前端、服务端、数据库和整体验收标准。

当前关键结论：

- 初期不做广告、充值、用户自助注册和高并发。
- 玩家账号由管理员创建。
- 初期使用标准麻将规则。
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
本地/Linux 测试：Ubuntu 虚拟机 + Node.js + SQLite
后续扩展：Docker Compose + PostgreSQL + Nginx/Caddy
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

## 7. 历史参考文档

以下文档为前期讨论沉淀，后续可以作为参考，不作为当前主线入口：

- [initial-local-test-requirements-and-development-plan.md](./initial-local-test-requirements-and-development-plan.md)
- [online-mahjong-architecture-and-development-plan.md](./online-mahjong-architecture-and-development-plan.md)

后续如果文档继续扩展，建议优先更新六个主文档：

- `requirements.md`
- `architecture-design.md`
- `technical-architecture.md`
- `development-plan.md`
- `environment-setup.md`
- `phase-2-runbook.md`
