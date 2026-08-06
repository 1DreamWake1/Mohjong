# 在线麻将文档

本文档目录只保留当前有效的产品、技术和运行信息。已完成阶段的过程记录不再单独维护，以代码、测试和 Git 历史为准。

## 主文档

| 文档                                               | 内容                                          |
| -------------------------------------------------- | --------------------------------------------- |
| [requirements.md](./requirements.md)               | 产品范围、角色、功能和验收标准                |
| [architecture-design.md](./architecture-design.md) | 当前架构、模块边界、数据流和技术约束          |
| [development-plan.md](./development-plan.md)       | 已完成能力、当前阶段和后续路线                |
| [environment-setup.md](./environment-setup.md)     | 本地开发与 Docker 主机环境准备                |
| [deployment.md](./deployment.md)                   | Docker Compose、Render 演示版部署、验证和运维 |

## 规则与界面参考

| 文档                                                         | 内容                   |
| ------------------------------------------------------------ | ---------------------- |
| [simple-rules.md](./simple-rules.md)                         | 当前快速对局的规则基线 |
| [sichuan-rules-design.md](./sichuan-rules-design.md)         | 四川麻将后续扩展边界   |
| [tile-rendering-reference.md](./tile-rendering-reference.md) | 麻将牌面渲染对照       |

## 当前状态

- 阶段 0-17 已完成。
- 阶段 18A 容器化与统一入口、18B 健康检查与进程生命周期已完成。
- 阶段 18C SQLite 备份、恢复和升级回滚已完成。
- 阶段 18D 生产配置与安全基线已完成。
- 阶段 18E 自动化验收与运行手册已完成，阶段 18 全部完成。
- 阶段 19A 四川麻将基础规则预设已完成，阶段 19B 已完成主要核心约束，阶段 19C 血战到底多赢家状态正在开发。
- 后续评估完整四川麻将玩法、多实例与公网部署。
- 当前部署边界是 Docker Compose、单 Server 实例和 SQLite 持久化卷。
- Render Free 适配已保留在历史提交中，但当前不作为推荐部署方案。

新增或重命名文档时必须同步更新本索引。
