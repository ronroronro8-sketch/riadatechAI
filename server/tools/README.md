# Business Calculation Tools V1

Pure backend functions are exported through `businessCalculationTools`. Add tools by extending the registry, definitions, resolver and tests. No Gemini call performs the calculation. `resolveCalculationTools` recognizes labelled Arabic/English inputs in calculation requests; it never accepts a client tool result or interprets generated assistant text as an input.

Money inputs are `{ amount: "600", currency: "OMR" }` or `{ amount: "2500", currency: "baisa" }`. OMR supports up to three fractional digits; baisa must be integral. Integer BigInt baisa arithmetic implements `1 OMR = 1000 baisa`. Money results use three OMR decimal places. Ratios/percentages include an exact rational numerator/denominator plus a display rounded half-up to six decimal places. Break-even rounds **up** to whole units; revenue at break-even is those whole units times price.

| Tool | Required inputs | Definition |
| --- | --- | --- |
| calculateBreakEven | fixedCosts, unitPrice, unitVariableCost | ceil(fixedCosts / (unitPrice − unitVariableCost)); requires positive unit contribution |
| calculateROI | netProfit, investment | netProfit / investment × 100%; not annualized |
| calculateROAS | revenue, adSpend | Advertising-attributed revenue / advertising spend, same campaign/period; not total business revenue or total costs |
| calculateMonthlyProfit | revenue, totalCosts | Monthly revenue − supplied total monthly costs |
| calculateProfitMargin | revenue, totalCosts | (revenue − totalCosts) / revenue × 100%; not markup |
| calculateUnitEconomics | unitPrice, unitVariableCost | Per-unit contribution and contribution margin before fixed costs; not net profit, CAC or LTV |

All amounts except netProfit must be nonnegative. Division by zero, unsupported units, excess precision, missing inputs, competing values and mismatched periods produce structured clarification/error results instead of fabricated numbers. Losses remain negative. Tools do not infer taxes, fees, amortization, campaign attribution or missing expenses. The caller must supply the appropriate complete scope; ROAS `revenue` specifically means ad-attributed revenue.

Examples recognized by the assistant:
- `احسب الربح الشهري: الإيرادات 2000 OMR، إجمالي التكاليف 1500 OMR.`
- `احسب ROAS: إيرادات الإعلانات 600 OMR، الإنفاق الإعلاني 150 OMR.`
- `احسب نقطة التعادل: التكاليف الثابتة 1000 OMR، سعر الوحدة 7 OMR، التكلفة المتغيرة للوحدة 4 OMR.`

There is no default currency for user text: each amount needs a unit, or an explicit statement such as `جميع المبالغ بالريال العماني`. The monthly-profit resolver requests confirmation of a monthly period when absent. A follow-up can supply missing labelled values to the most recent completed pending calculation; its known inputs come only from stored server tool metadata. Ambiguous/unrecognized formulations may require restating labelled inputs; this is not unrestricted natural-language parsing.

Results include status, normalized inputs, input sources, formulas, calculation type, units and rounding details. They are persisted in assistant message `metadata.calculationTools` before Gemini and passed as a separate `BUSINESS_CALCULATION_TOOL_RESULTS` context, independent of systemInstruction, Business Memory, Smart Map and conversation history. Missing/invalid statuses explicitly instruct the assistant to request clarification, not invent a result. The existing stream protocol and model/thinking configuration are unchanged. `/api/chat` also uses the resolver, without persistent follow-up state.

Memory and Smart Map are not automatically used as operands in V1: budget/capital are not necessarily investment, and rent caps/prototype rent suggestions are not actual fixed/total costs. No unsafe mapping is inferred. `convertMoney` is an exact backend utility; it is not an additional natural-language tool.
