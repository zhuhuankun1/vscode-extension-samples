#每次生成新的task遵META_for_prompt.md中的开发规范

## Task 1: 创建 Prompt Enhancement Participant 框架 + Mock 完整效果
**目标**: 实现一个新的 Chat Participant (@vv)，用 mock 数据展示完整的最终效果。

**步骤**:
1. 新建文件 `src/codePilot.ts`，定义接口与 mock 实现：
   - `generateEnhancedPrompt(rawPrompt, context)` 接口
   - Mock 返回完整的增强 prompt 结果，包含：userInput、llmThinkingProcess、selectedStrategy（primary/secondary/rationale）、enhancementProcess、enhancedPrompt
2. 在 `src/extension.ts` 中导入并注册该 participant，命令别名为 `@vv`
3. 编译验证无误（`npm run compile`）
4. 在 VS Code 中手动测试 @vv chat participant 可以正常启动并返回 mock 数据

**验收**:
- [x] `codePilot.ts` 创建，包含 mock 实现
- [x] `extension.ts` 注册 @vv participant
- [x] `package.json` 添加 @vv chat participant 配置
- [x] 代码编译通过
- [x] 在 Chat 面板中能调用 @vv 并看到 mock 结果

---

## Task 2: 将 Mock 替换为真实 LLM 策略判断 + 验证不同策略的准确性
**目标**: 用真实LLM调用替换mock，并通过6个测试用例验证每个策略都能被正确选择

**前置条件**:
- Task 1已完成，@vv participant已可用
- 已安装GitHub Copilot Chat扩展

**步骤**:

### 1. 实现两步LLM工作流 (🔄 架构改进)
设计改进为两步流程，每步职责明确分离：

**Step 1: 策略选择（selectStrategy函数）**
- 使用 `STRATEGY_SELECTION_ONLY_PROMPT` 约束LLM
- 调用LLM返回JSON格式结果：`{ primary, rationale, analysis }`
- 失败时默认回退到BASE策略
- 接口：`selectStrategy(rawPrompt, context, model, token) → StrategySelectionResult`

**Step 2: 增强生成（generateEnhancedPromptForStrategy函数）**
- 使用 `PROMPT_ENHANCEMENT_PROMPT` 按策略生成增强
- 接收Step 1的策略选择作为输入
- 返回增强后的prompt文本
- 失败时返回原始prompt
- 接口：`generateEnhancedPromptForStrategy(rawPrompt, strategy, context, model, token) → string`

**Chat Participant编排**
- 在handler中调用两步，分别显示结果
- Step 1显示：策略选择 + 分析理由
- Step 2显示：增强后的prompt

### 2. 创建测试用例 (`src/strategyTestCases.ts`)
包含6个真实场景，验证每个策略都能被正确判断：

| # | 场景 | 用户Prompt特征 | 预期策略 | 验证特征 |
|---|------|--------------|--------|--------|
| **1** | 代码性能优化 | 给出代码+性能问题 | `META` | Role框架 + [PLAN]/[EXECUTE] + 推理 |
| **2** | 简单知识查询 | 简短单一问题 | `BASE` | 最小改动 |
| **3** | 技术方案对比 | 两个选项+维度 | `TOT_SIMPLE` | A/B方案对比+综合决策 |
| **4** | 代码实现+示例 | 需求+要示例 | `FEWSHOT` | 2-3个代码示例+框架 |
| **5** | 大型系统设计 | 复杂多维需求 | `CHAIN` | [PLAN]→[EXECUTE]→[REFINE]→[FINAL] |
| **6** | 代码质量审查 | 代码+审查要求 | `META` | Role框架 + [PLAN]/[EXECUTE] + 改进 |

### 3. 系统Prompt设计 (🎯 关键)

**STRATEGY_SELECTION_ONLY_PROMPT** (Step 1专用)
- 输入: 用户prompt + 上下文
- 约束: 只返回JSON，**不生成增强指令**
- 输出: `{ primary, secondary, rationale, analysis }`
- 关键字: "你的工作是选择策略，真正的增强在下一步"

**PROMPT_ENHANCEMENT_PROMPT** (Step 2专用)
- 输入: 原始prompt + 策略信息
- 约束: 按策略类型生成结构化增强
- 输出: 直接返回增强后的prompt (纯文本)
- 关键字: "根据选定的策略生成"

### 4. StrategyTestCase 定义说明
`src/strategyTestCases.ts` 中的 `StrategyTestCase` 接口和 `strategyTestCases` 数组是**测试用例数据**，包含：
- 6个真实场景prompts（对应6种策略组合）
- 每个用例包含：userPrompt、expectedStrategy、expectedCharacteristics等
- 用于验证LLM是否能正确选择和增强每种策略类型
- 不是模板，而是具体的测试数据集

### 5. 验收标准
**代码实现** ✅
- [x] `selectStrategy()` 函数实现完整，能调用真实LLM并解析JSON
- [x] `generateEnhancedPromptForStrategy()` 函数实现完整，能生成增强prompt
- [x] Chat Participant handler编排两个步骤
- [x] 错误处理：Step 1失败→回退BASE，Step 2失败→返回原始prompt
- [x] `src/strategyTestCases.ts` 包含6个测试用例定义

**编译验证** ✅
- [x] `npm run compile` 无错误
- [x] TypeScript类型检查通过
- [x] 所有导入和依赖正确

**功能验证**
- [ ] 能在VS Code Chat面板中调用 @vv
- [ ] 6个测试用例都返回符合预期的策略
  - 用例1: 返回 META ✓
  - 用例2: 返回 BASE ✓
  - 用例3: 返回 TOT_SIMPLE ✓
  - 用例4: 返回 FEWSHOT ✓
  - 用例5: 返回 CHAIN ✓
  - 用例6: 返回 META ✓
- [ ] 每个增强prompt都包含其策略的关键特征
  - META: 包含 `Role:`、`Objectives:`、`Constraints:`
  - COT: 包含 `[PLAN]`、`[EXECUTE]`、`[REFINE]` 等
  - TOT_SIMPLE: 包含 A/B方案对比
  - FEWSHOT: 包含 2-3个代码示例
  - CHAIN: 包含完整四阶段标签
  - BASE: 接近原始，最小改动

**测试执行方法**
```bash
# 1. 编译
npm run compile

# 2. 启动开发环境
npm run watch
# F5 在VS Code中启动Extension Host

# 3. 在Chat中测试
Ctrl+Shift+I  # 打开Chat面板
@vv           # 输入任一测试prompt（参考 src/strategyTestCases.ts 中的6个用例）
# 观察返回的策略和增强结果
```