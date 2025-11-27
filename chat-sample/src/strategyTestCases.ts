/**
 * Strategy Test Cases - 用于验证不同的 prompt 类型能否得到正确的策略选择
 * 每个测试用例都是一个真实的场景，确保LLM能够区分不同的需求类型
 */

export interface StrategyTestCase {
	id: number;
	name: string;
	userPrompt: string;
	expectedPrimaryStrategy: string;
	expectedCharacteristics: string[];
	description: string;
}

/**
 * 6个核心测试用例，覆盖所有策略类型及其组合
 */
export const strategyTestCases: StrategyTestCase[] = [
	{
		id: 1,
		name: '代码性能优化 (META)',
		userPrompt: `我有一个处理百万级数据的TypeScript函数，现在性能很差.
代码：
\`\`\`typescript
function processData(items: any[]) {
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (items[i].id === items[j].parent_id) {
        items[i].children = items[i].children || [];
        items[i].children.push(items[j]);
      }
    }
  }
  return items;
}
\`\`\`
请帮我识别问题并给出改进方案。`,
		expectedPrimaryStrategy: 'META',
		expectedCharacteristics: [
			'包含 Role: 性能优化专家',
			'包含 Objectives: 识别瓶颈、提出改进',
			'包含 [PLAN] 阶段：分析算法复杂度',
			'包含 [EXECUTE] 阶段：系统性审查',
			'包含具体的代码改进示例'
		],
		description: '这是一个典型的代码审查+优化需求。需要结构化的分析框架（META）和分步骤推理（COT）来系统地诊断问题并提出方案。'
	},

	{
		id: 2,
		name: '简单知识查询 (BASE)',
		userPrompt: `ES6中Promise有几种状态？`,
		expectedPrimaryStrategy: 'BASE',
		expectedCharacteristics: [
			'最小化改动',
			'接近原始prompt',
			'无多余的结构化指令'
		],
		description: '这是一个简单的知识问题，无需增强。LLM应该识别出这是基础问答，直接返回BASE策略。'
	},

	{
		id: 3,
		name: '技术方案对比 (TOT_SIMPLE)',
		userPrompt: `我的项目需要选择一个关系型数据库。
现在在MySQL和PostgreSQL之间犹豫不决。
请对比这两个数据库在以下场景中的优缺点：
- 高并发读写场景
- 复杂JOIN查询
- 成本考量

然后给出最终建议。`,
		expectedPrimaryStrategy: 'TOT_SIMPLE',
		expectedCharacteristics: [
			'包含方案A（MySQL）的优缺点分析',
			'包含方案B（PostgreSQL）的优缺点分析',
			'包含场景细分对比',
			'包含明确的综合推荐决策',
			'结构化的决策理由'
		],
		description: '这是典型的多方案对比需求。用户需要看到两个方案在不同维度的对比，最后得到综合的推荐。TOT_SIMPLE策略会生成A/B方案对比指令。'
	},

	{
		id: 4,
		name: '代码实现+示例 (FEWSHOT)',
		userPrompt: `我需要实现一个React组件，要求：
- 支持异步数据加载
- 展示加载状态和错误状态
- 使用TypeScript
- 包含单元测试

但我不太确定最佳实践是什么，希望看到几个参考示例。`,
		expectedPrimaryStrategy: 'FEWSHOT',
		expectedCharacteristics: [
			'包含 2-3 个完整的React组件示例',
			'示例展示不同的状态管理方式（useState vs useReducer）',
			'包含TypeScript类型定义',
			'包含对应的单元测试示例',
			'每个示例都有注释说明最佳实践',
			'包含结构化的"何时使用哪个方案"的对比'
		],
		description: '用户要求代码示例，这是FEWSHOT策略的典型场景。结合META可以提供更结构化的指导框架。'
	},

	{
		id: 5,
		name: '大型系统架构设计 (CHAIN)',
		userPrompt: `设计一个系统架构来支持每日百万级用户，具体需求：
- 实时数据处理和聚合
- 支持多地域部署
- 高可用性要求 99.99%
- 成本可控

请给出完整的架构方案。`,
		expectedPrimaryStrategy: 'CHAIN',
		expectedCharacteristics: [
			'包含明确的 [PLAN] 阶段：需求分析、关键指标',
			'包含 [EXECUTE] 阶段：技术选型、组件设计',
			'包含 [REFINE] 阶段：性能优化、成本优化',
			'包含 [FINAL] 阶段：最终架构总结和检查清单',
			'每个阶段都有具体的决策点和权衡分析'
		],
		description: '这是一个复杂的多阶段规划问题。CHAIN策略会将其分解为plan→execute→refine→final四个阶段，确保思考过程完整和系统。'
	},

	{
		id: 6,
		name: '代码审查+质量检查 (META)',
		userPrompt: `请对以下Node.js服务的代码进行全面审查：

\`\`\`typescript
export async function handleUserRequest(req, res) {
  const data = await db.query('SELECT * FROM users WHERE id = ' + req.params.id);
  const processed = data[0];
  res.json({ status: 'ok', data: processed });
}
\`\`\`

需要识别出所有问题（包括安全、性能、最佳实践等）并给出具体改进方案。`,
		expectedPrimaryStrategy: 'META',
		expectedCharacteristics: [
			'包含 Role: 资深代码审查专家',
			'包含 Objectives: 识别安全、性能、可维护性问题',
			'包含 [PLAN] 阶段：明确审查维度（SQL注入、类型安全等）',
			'包含 [EXECUTE] 阶段：逐项分析（至少3个问题）',
			'包含 [REFINE] 阶段：改进优先级排序',
			'包含具体的改进代码示例',
			'包含质量检查清单'
		],
		description: '这是最复杂的真实场景：代码审查。需要META的结构化框架+COT的分步骤分析，以及具体的代码示例和改进建议。'
	}
];

/**
 * 生成测试报告
 */
export function generateTestReport(results: {
	testCaseId: number;
	actualPrimary: string;
	actualSecondary?: string;
	passed: boolean;
	notes: string;
}[]) {
	const report = {
		totalTests: results.length,
		passed: results.filter(r => r.passed).length,
		failed: results.filter(r => !r.passed).length,
		details: results
	};

	return report;
}

/**
 * 验证测试用例特征
 */
export function verifyCharacteristics(enhancedPrompt: string, expectedCharacteristics: string[]): {
	matched: string[];
	missing: string[];
} {
	const matched = expectedCharacteristics.filter(char => enhancedPrompt.includes(char));
	const missing = expectedCharacteristics.filter(char => !enhancedPrompt.includes(char));

	return { matched, missing };
}
