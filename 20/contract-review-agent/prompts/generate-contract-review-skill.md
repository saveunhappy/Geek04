你是一名资深的 AI Skill 设计师，擅长为 Pi-mono / Claude Code 等 Agent 平台设计可复用的业务 Skill。

请帮我设计一个名为 `contract-risk-review-claw` 的合同风险审查 Skill。

## Skill 定位

当用户上传合同文件（PDF/Word/文本）要求审查风险，或提到"合同审查"、"不平等条款"、"违约责任"、"知识产权"、"管辖权"等关键词时，自动触发此 Skill。

Skill 的核心能力：深度识别合同风险条款，给出修订建议，守住法律红线。

## 需要输出的文件

### 1. `.pi/skills/contract-risk-review-claw/SKILL.md`

包含以下内容：

- **frontmatter**：`name: contract-risk-review-claw`，以及一段精准的 `description`，说明触发场景。
- **核心理念**：合同不是走形式，每个字都可能是坑，让 AI 先帮你踩一遍。
- **工作流程**：文本提取 → 结构解析 → 语义风险识别 → 风险分级 → 生成修订建议 → 输出审查报告。
- **6 类风险类型表格**：
  - 不平等条款
  - 违约责任失衡
  - 知识产权陷阱
  - 管辖权不利
  - 表述模糊
  - 隐藏义务
  
  每类风险需要给出：识别要点、典型案例。
- **默认输出格式**：markdown 形式的合同审查报告，包含总体评分 A/B/C/D、风险概览、🔴🟠🟡 风险条款清单、审查结论。
- **JSON 输出模式**：当调用方明确要求 JSON 时，只返回包含 `level/type/clause/originalText/suggestion` 的数组，用于程序聚合。
- **参考资料说明**：引用 `references/` 目录下的 4 个文件。

### 2. `.pi/skills/contract-risk-review-claw/references/risk-clauses.md`

按 6 类风险分类，列举典型风险条款案例。每类至少 3 个案例，每个案例包含：风险描述、典型表述、修订方向。

### 3. `.pi/skills/contract-risk-review-claw/references/contract-templates.md`

常见合同类型（技术服务、采购供货、劳务用工、房屋租赁、股权投资、保密协议、合作协议）的标准关键条款写法，用于对比分析。

### 4. `.pi/skills/contract-risk-review-claw/references/legal-regulations.md`

与合同风险审查相关的法律条文要点，主要引用《中华人民共和国民法典》合同编相关条款。

### 5. `.pi/skills/contract-risk-review-claw/references/revision-suggestions.md`

针对 6 类风险的标准修订建议和替代文本模板，审查时可以直接套用。

## 设计要求

1. **语义理解优先**：不要只做关键词匹配，要理解条款的真实含义和逻辑陷阱。
2. **上下文关联**：结合合同类型、我方角色（甲方/乙方）判断风险方向。
3. **可解释性**：每个风险点都要有明确理由。
4. **实用性**：给出可直接使用的替代文本，而非泛泛建议。
5. **输出克制**：默认输出 markdown 报告；JSON 模式下只输出纯 JSON 数组，不要额外解释。

请直接输出完整的文件内容，我可以直接复制到项目目录中使用。
