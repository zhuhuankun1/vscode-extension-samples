import * as vscode from 'vscode';
import { strategyTestCases } from './strategyTestCases';

/**
 * Strategy types for prompt enhancement
 */
export type StrategyType = 'BASE' | 'COT' | 'TOT_SIMPLE' | 'META' | 'FEWSHOT' | 'CHAIN';

/**
 * Context information passed to the prompt enhancement function
 */
export interface EnhancementContext {
	recentMessages?: string[];
	language?: string;
	selectedCode?: string;
	userGoalGuess?: string;
}

/**
 * Result of LLM strategy selection (Step 1)
 * Contains only the strategy choice and rationale, without enhanced prompt
 */
export interface StrategySelectionResult {
	userInput: string;
	selectedStrategy: {
		primary: StrategyType;
		rationale: string;
	};
	llmAnalysis: string;
}

/**
 * Result of prompt enhancement (Step 2)
 * Contains the fully enhanced prompt based on the selected strategy
 */
export interface EnhancedPromptResult {
	userInput: string;
	selectedStrategy: {
		primary: StrategyType;
		rationale: string;
	};
	enhancedPrompt: string;
}

/**
 * Chat result for CodePilot participant
 */
interface ICodePilotChatResult extends vscode.ChatResult {
	metadata: {
		command: string;
	}
}

/**
 * LLM System Prompt for Strategy Selection (Step 1)
 * Only selects the best strategy, does NOT generate enhanced prompt
 */
const STRATEGY_SELECTION_ONLY_PROMPT = `你是一个提示词优化专家。分析用户的原始输入，选择最优的增强策略。

可选策略:
- BASE: 不增强，直接返回原始prompt
- COT: 添加"分步骤推理"指令
- TOT_SIMPLE: 生成两个不同思路（A/B）对比
- META: 提供结构化框架（角色、目标、约束、输出格式等）
- FEWSHOT: 插入2-3个具体示例
- CHAIN: 分阶段结构化（[PLAN] → [EXECUTE] → [REFINE] → [FINAL]）

策略选择规则:
- 优化/改写需求 → META
- 需要步骤推理 → COT 或 CHAIN
- 方案对比 → TOT_SIMPLE
- 需要示例 → FEWSHOT
- 简单问答 → BASE

**重要**: 只返回JSON，不生成增强指令。你的工作是选择策略，真正的增强在下一步。

返回JSON格式（不生成enhancedPrompt）:
{
  "primary": "...",
  "secondary": "...(可选)",
  "rationale": "为什么选择这个策略",
  "analysis": "简要分析这个prompt的特点和为什么适合该策略"
}`;

/**
 * LLM System Prompt for Prompt Enhancement (Step 2)
 * Generates the enhanced prompt based on the selected strategy
 *
 * 重要: 你的任务是"增强/修改这个prompt"，而不是"回答这个prompt"
 * 增强意味着：添加结构、指导、上下文、约束等，使原始prompt更清晰有效
 */
const PROMPT_ENHANCEMENT_PROMPT = `你是一个提示词增强专家。根据选定的策略，对用户的原始prompt进行增强。

**重要区别**：
- ❌ 不是回答这个prompt（不要给出答案）
- ✅ 是重写/增强这个prompt，使其更清晰、更有效、更能得到高质量回答

**策略增强方式** (按权重应用，primary为主要80%，secondary为辅助20%)：

单一策略:
- BASE: 直接返回原始prompt，最小改动，不添加任何结构
- COT: 在prompt中添加分步骤推理框架（[PLAN] → [EXECUTE] → [REFINE] → [FINAL]），引导逐步思考
- TOT_SIMPLE: 改写prompt为对比框架，明确要求对比A/B两个方案的优缺点，最后给出综合推荐
- META: 改写prompt为结构化框架（Role / Objectives / Constraints / Output Format / Quality Checklist）
- FEWSHOT: 改写prompt为示例驱动框架，明确要求提供2-3个具体代码/示例，并在每个示例后说明其意义
- CHAIN: 改写prompt为完整四阶段框架（[PLAN] → [EXECUTE] → [REFINE] → [FINAL]），每阶段明确输出要求

复合策略应用规则 (Primary为主导，Secondary为增强):
- FEWSHOT + COT: 【主】以示例为中心，【辅】在示例间加入"为什么这样工作"的分步骤说明
- FEWSHOT + META: 【主】示例为核心，【辅】加入Role/Objectives框架来指导示例的选择
- META + COT: 【主】结构化框架为基础，【辅】在框架内添加分步骤推理指导
- META + FEWSHOT: 【主】结构化框架，【辅】框架内包含具体示例
- 其他组合: Primary策略占主体（70-80%），Secondary策略作为补充细节（20-30%）

**增强的是prompt本身，不要直接回答问题**
直接返回增强后的prompt（纯文本形式），不需要JSON或其他格式。`;

/**
 * Call LLM Step 1: Select the best strategy for the prompt
 * Only returns strategy choice and analysis, no enhanced prompt yet
 */
async function selectStrategy(
	rawPrompt: string,
	context: EnhancementContext,
	model: vscode.LanguageModelChat,
	token: vscode.CancellationToken
): Promise<StrategySelectionResult> {
	try {
		const userMessage = JSON.stringify({
			userPrompt: rawPrompt,
			context: {
				language: context.language,
				selectedCode: context.selectedCode ? '[代码已选中]' : 'N/A',
				userGoalGuess: context.userGoalGuess
			}
		});

		const messages = [
			vscode.LanguageModelChatMessage.User(STRATEGY_SELECTION_ONLY_PROMPT + '\n\n' + userMessage)
		];

		const response = await model.sendRequest(messages, {}, token);

		let llmResponse = '';
		for await (const fragment of response.text) {
			llmResponse += fragment;
		}

		// Parse JSON response
		const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('LLM response does not contain valid JSON');
		}

		const parsed = JSON.parse(jsonMatch[0]);

		if (!parsed.primary) {
			throw new Error('LLM response missing required field: primary');
		}

		return {
			userInput: rawPrompt,
			selectedStrategy: {
				primary: parsed.primary as StrategyType,
				rationale: parsed.rationale || 'No rationale provided'
			},
			llmAnalysis: parsed.analysis || 'No analysis provided'
		};

	} catch (error) {
		console.error('Strategy selection failed:', error);
		return {
			userInput: rawPrompt,
			selectedStrategy: {
				primary: 'BASE',
				rationale: 'Strategy selection failed, defaulting to BASE'
			},
			llmAnalysis: `Error: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}

/**
 * Call LLM Step 2: Generate enhanced prompt based on selected strategy
 */
async function generateEnhancedPromptForStrategy(
	rawPrompt: string,
	strategy: StrategySelectionResult,
	context: EnhancementContext,
	model: vscode.LanguageModelChat,
	token: vscode.CancellationToken
): Promise<string> {
	try {
		const strategyInfo = `Strategy: ${strategy.selectedStrategy.primary}`;

		const userMessage = `${PROMPT_ENHANCEMENT_PROMPT}

---

${strategyInfo}

**策略应用权重说明**:
- Primary策略是主要框架和重点（占80%的内容和结构）
- Secondary策略是补充和增强（占20%，用来完善primary）

---

**Original Prompt (需要增强):**
${rawPrompt}

---

**Context:**
- Language: ${context.language || 'N/A'}
- Has selected code: ${context.selectedCode ? 'Yes' : 'No'}

---

**请输出增强后的prompt。确保按照策略权重来应用（Primary为主，Secondary为辅）。不要回答这个prompt，只需改写/增强它。**`;

		const messages = [
			vscode.LanguageModelChatMessage.User(userMessage)
		];

		const response = await model.sendRequest(messages, {}, token);

		let enhancedPrompt = '';
		for await (const fragment of response.text) {
			enhancedPrompt += fragment;
		}

		return enhancedPrompt;

	} catch (error) {
		console.error('Prompt enhancement failed:', error);
		return rawPrompt; // Fallback to original
	}
}

/**
 * Register the CodePilot Chat Participant
 * @param context VS Code extension context
 */
export function registerCodePilotParticipant(context: vscode.ExtensionContext): void {
	const handler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		chatContext: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<ICodePilotChatResult> => {
		try {
			// Get the user's message
			const userMessage = request.prompt;

			// Prepare context for enhancement
			const enhancementContext: EnhancementContext = {
				language: vscode.window.activeTextEditor?.document.languageId,
				selectedCode: vscode.window.activeTextEditor?.document.getText(
					vscode.window.activeTextEditor.selection
				),
				userGoalGuess: userMessage
			};

			// Step 1: Strategy selection
			stream.markdown(`# 🔍 Analyzing your prompt...\n\n`);

			const strategySelection = await selectStrategy(
				userMessage,
				enhancementContext,
				request.model,
				token
			);

			// Display strategy selection
			stream.markdown(`## ✅ Strategy Selection Result\n\n`);
			stream.markdown(`**Selected Strategy:** \`${strategySelection.selectedStrategy.primary}\`\n`);
			stream.markdown(`\n**Rationale:** ${strategySelection.selectedStrategy.rationale}\n\n`);
			stream.markdown(`**Analysis:** ${strategySelection.llmAnalysis}\n\n`);

			// Step 2: Generate enhanced prompt
			stream.markdown(`---\n\n# ✨ Generating enhanced prompt...\n\n`);

			const enhancedPrompt = await generateEnhancedPromptForStrategy(
				userMessage,
				strategySelection,
				enhancementContext,
				request.model,
				token
			);

			// Display enhanced prompt
			stream.markdown(`## 📝 Enhanced Prompt\n\n`);
			stream.markdown('```\n');
			stream.markdown(enhancedPrompt);
			stream.markdown('\n```\n\n');

			return { metadata: { command: 'enhance' } };

		} catch (error) {
			stream.markdown(`❌ Error processing prompt enhancement: ${error}`);
			return { metadata: { command: 'enhance' } };
		}
	};

	// Register the chat participant
	const participant = vscode.chat.createChatParticipant('vv', handler);
	participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'ss.jpg');
	participant.followupProvider = {
		provideFollowups(_result: ICodePilotChatResult, _chatContext: vscode.ChatContext, _token: vscode.CancellationToken) {
			return [
				{
					prompt: 'Show me another enhancement strategy',
					label: vscode.l10n.t('Try different strategy'),
				} satisfies vscode.ChatFollowup
			];
		}
	};
}
