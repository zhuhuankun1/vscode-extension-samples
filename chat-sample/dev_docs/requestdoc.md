下面是你最新需求的“仅用 LLM 判定、去掉启发式特征抽取”版的结构化整理，重点突出：不写本地正则与计数逻辑，策略选择完全由一次或少量 LLM 调用完成。

## 1. 总体目标
实现一个 VS Code Chat Participant，用于“Prompt for Prompt”增强：
- 输入：用户原始 prompt（以及 participant 可直接读取的上下文：历史对话、选中文件片段、语言类型、用户意图）。
- 输出：增强后的高质量 prompt（结构化、包含必要的思维指令或示例）。
- 要求：快速 Demo，可行性验证；不关注 token 成本优化；实现极简；TOT 仅保留极简概念（可选）。

## 2. 支持的策略集合
需要模型自动选择或组合以下策略（由 LLM 判定）：
- BASE（不增强，直接原始）
- COT（加“分步骤推理”）
- TOT_SIMPLE（固定少量分支思路对比，非复杂搜索）
- META（元提示模板：角色、目标、约束、格式、自检）
- FEWSHOT（插入少量示例；示例也可由 LLM 直接生成而非检索）
- CHAIN（分阶段：plan → execute → refine → final）
允许复合：例如 META + COT。

### 示例生成支持
所有策略均可通过 LLM 模拟生成示例：
- **BASE**：直接返回原始输入，无需示例。
- **COT**：生成包含分步骤推理的示例，展示如何逐步解决问题。
- **TOT_SIMPLE**：生成两个不同思路（A/B）及其优缺点的示例，并给出最终综合策略。
- **META**：生成包含角色、目标、约束等结构化内容的示例。
- **FEWSHOT**：生成 2-3 个高密度、代表性的示例，直接插入增强内容。
- **CHAIN**：生成分阶段（[PLAN] [EXECUTE] [REFINE] [FINAL]）的示例，展示每个阶段的具体内容。

通过这些示例，快速验证策略的可行性并支持 Demo 展示。

## 3. 策略选择方式（全 LLM 判定）
不做本地特征抽取与打分矩阵；用一个“策略分类 + 解释” 双轮 LLM 调用完成：
1. 第一次调用：输入包含 prompt + 上下文 + 可用策略说明 → 输出：
   - primary 策略
   - optional secondary（复合）
   - 简要 rationale
   - 若 FEWSHOT：让模型直接给出 2–3 条最小示例（或示例生成指令）
2. 可选第二次调用（如果需要 TOT_SIMPLE 或模型返回不确定）：对第一个结果做 refine/确认。首版可省略，只用一次调用。

## 4. LLM 判定提示模板（示例）
系统指令（可嵌入文件中硬编码）：
```
你是一个策略选择器。根据用户的原始输入和上下文，输出一个 JSON：
{
  "primary": "...",
  "secondary": "...(可选)",
  "rationale": "...",
  "enhancedPrompt": "...",
  "fewShotExamples": [ ...(可选, 2-3条) ]
}
可选策略: BASE, COT, TOT_SIMPLE, META, FEWSHOT, CHAIN。
规则:
- 若用户想优化/改写提示 → 优先 META。
- 若需要步骤推理 → COT 或 CHAIN (多阶段则 CHAIN)。
- 若需要对比/多方案选择 → TOT_SIMPLE。
- 若需要示例而未提供 → FEWSHOT。
- 若无明显增强价值 → BASE。
- 可复合，如 META + COT。
增强后的 prompt 要包含结构化指令、清晰输出格式、必要的思维过程要求。
```

用户输入包装示例：
```
{
  "userPrompt": "<原始文本>",
  "context": {
    "recentMessages": [...],
    "language": "typescript",
    "selectedCode": "...",
    "userGoalGuess": "..."
  }
}
```

LLM 输出后直接解析 JSON；失败则回退简单增强（例如默认 COT）。

## 5. 增强输出格式要求
`enhancedPrompt` 中统一包含：
- 简要目标重述
- 角色设定（如需要）
- 步骤或分阶段结构（视策略而定）
- 约束（如精简、格式、质量标准）
- 自检清单（可选）
- 对 FEWSHOT：示例插入区块
- 对 TOT_SIMPLE：两个方案对比指令 + 最终合并指令
- 对 CHAIN：明确阶段标签

## 6. TOT_SIMPLE 极简定义
无需真实树搜索：
- 让模型先生成两个不同思路（A/B）和各自优缺点，然后要求其在同一次回答中给出“综合最终策略”区块。全部由一个 prompt 控制完成，避免多轮。

## 7. FEWSHOT 极简实现
由 LLM 直接生成少量内嵌示例：
- 指令：“如果选择 FEWSHOT，请生成 2~3 个微型、高密度、代表性的示例（不超过 N 行）。示例要与用户任务强相关。”
- 不做向量检索；后续扩展再加。

## 8. CHAIN 简化
在 `enhancedPrompt` 中加入阶段标签：
```
[PLAN] ...
[EXECUTE] ...
[REFINE] ...
[FINAL] 输出最终答案并自检：...
```
主模型按上述结构响应；不做多轮控制。

## 9. META 模板简化
当 primary=META 生成统一框架：
```
Role:
Objectives:
Constraints:
Output Format:
Quality Checklist:
(Optional Reasoning Instructions / COT if secondary)
```

## 10. 错误与回退策略
- LLM 输出解析失败或缺少 `primary` → 回退 COT（保守增强）。
- 输出策略不在集合 → 记录日志，回退 BASE。
- FEWSHOT 被选但没示例 → 在增强 prompt 中插入“请提供 2 个简短示例”指令。

## 11. 不需要的内容（明确排除）
- 不写任何正则、计数、NLP 本地分析函数。
- 不做 token 成本评估与预算控制。
- 不做在线学习或反馈自适应。
- 不做真实多轮 TOT 思维树扩展。

## 12. 交付与接口
- 一个新文件：`codePilot.ts`
  - 暴露 `generateEnhancedPrompt(rawPrompt, context)` 和 `registerCodePilotParticipant()` 注册函数
  - 内部只构建 LLM 调用 payload 和解析结果
- 在 `extension.ts` 导入并调用 `registerCodePilotParticipant(context)` 进行注册，命令别名为 `@vv`。
- 输出到 Chat 面板：展示 chosen strategies + enhancedPrompt。

## 13. 质量验收
- 能稳定返回结构化增强 prompt。
- 对多种输入（请求改写、需示例、需决策、普通问答）有明显区分输出。
- 没有本地复杂逻辑；易读、易扩展。
- LLM 失败时有清晰回退。

## 14. 后续可扩（非当前需求）
- 加入少量本地启发式减少一次 LLM 调用（可选）。
- 增多复合策略（META+CHAIN+FEWSHOT）。
- 加日志与简单统计 UI。

## 摘要一句话
你要一个“全靠单次 LLM 分类 + 生成”的简单策略选择与 prompt 增强 participant，实现 COT/TOT_SIMPLE/META/FEWSHOT/CHAIN 的自动选择与结构化增强，无需本地特征与复杂搜索，快速验证可行性。

如果确认无遗漏，我可以下一步直接起草 `strategyParticipant.ts` 初稿。需要的话告诉我。