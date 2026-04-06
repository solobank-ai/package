import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Registers all Solobank prompt templates with the MCP server.
 *
 * Prompts serve as reusable instruction templates that guide the AI agent
 * through common DeFi workflows, combining multiple tool calls into coherent
 * multi-step procedures.
 */
export function registerPrompts(server: McpServer): void {
  // ── 1. Financial Report ──

  server.prompt(
    'financial-report',
    'Generate a comprehensive financial report',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a comprehensive financial report for this Solobank wallet. Follow these steps in order:

1. Call solobank_address to retrieve the wallet address.
2. Call solobank_balance to retrieve current token balances (SOL, USDC, and any other held assets).
3. Call solobank_lending_rates with asset "USDC" and protocol "kamino" to retrieve current supply/borrow APYs.
4. Call solobank_lending_rates with asset "USDC" and protocol "marginfi" to retrieve current supply/borrow APYs.
5. Call solobank_lending_rates with asset "SOL" and protocol "kamino".
6. Call solobank_lending_rates with asset "SOL" and protocol "marginfi".
7. Call solobank_config with action "show" to retrieve safeguard limits and daily usage.

Then produce a structured report containing:
- Wallet summary: address, total portfolio value in USD
- Asset breakdown: balance, approximate USD value, and allocation percentage for each token
- Lending positions: any active supply or borrow positions across Kamino and MarginFi with current APY
- Current market rates: best available supply APY for USDC and SOL on each protocol
- Yield summary: total annualised yield being earned vs. idle capital missing out on yield
- Safeguard status: lock status, per-transaction limit, daily limit, and daily usage so far
- Recommendations: one or two concrete next steps to improve yield or reduce risk

Format the output clearly with headers and tables where appropriate.`,
          },
        },
      ],
    }),
  );

  // ── 2. Optimize Yield ──

  server.prompt(
    'optimize-yield',
    'Analyze USDC yield opportunities across Kamino and MarginFi',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze all available USDC yield opportunities across Kamino and MarginFi and recommend the optimal allocation. Follow these steps:

1. Call solobank_balance to see how much USDC is currently held in the wallet.
2. Call solobank_lending_rates with asset "USDC" and protocol "kamino" to get Kamino's current supply APY.
3. Call solobank_lending_rates with asset "USDC" and protocol "marginfi" to get MarginFi's current supply APY.
4. Call solobank_config with action "show" to confirm safeguard limits.

Then provide:
- A side-by-side rate comparison table (protocol, supply APY, borrow APY, estimated risk level)
- The recommended protocol for new USDC deposits and why
- The projected annual yield in both APY % and dollar terms based on current balance
- Whether rebalancing from the lower-rate protocol to the higher-rate protocol is worthwhile (considering transaction costs)
- Any caveats or risks specific to each protocol (smart contract risk, utilisation rate sensitivity, liquidation risk for borrowers)
- Concrete next steps with the exact tool calls to execute if the user approves (e.g. solobank_lend / solobank_rebalance)

Be precise with numbers. Highlight any significant APY spread between protocols.`,
          },
        },
      ],
    }),
  );

  // ── 3. Send Money ──

  server.prompt(
    'send-money',
    'Guide me through sending tokens',
    {
      recipient: z.string().describe('Recipient Solana wallet address'),
      amount: z.string().describe('Amount to send'),
      asset: z.string().describe('Asset to send (SOL or USDC)'),
    },
    ({ recipient, amount, asset }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Guide me through sending ${amount} ${asset} to ${recipient}. Follow these steps carefully:

1. Call solobank_balance to confirm the wallet holds sufficient ${asset}.
2. Call solobank_config with action "show" to check safeguard limits — verify the amount ${amount} does not exceed maxPerTx or push dailyUsed over maxDailySend.
3. Validate that "${recipient}" looks like a valid Solana address (base58, 32–44 characters). Warn if it appears invalid.
4. Call solobank_send with to="${recipient}", amount=${amount}, asset="${asset}", dryRun=true to preview the transaction and confirm fees.
5. Present the dry-run result clearly: recipient address, amount, estimated fee, and any warnings.
6. Ask the user to confirm before proceeding.
7. If the user confirms, call solobank_send with dryRun=false to execute the transfer.
8. Report the transaction signature and final status.

Safety reminders to mention:
- Double-check the recipient address — Solana transactions are irreversible.
- If the amount is large relative to the daily limit, flag this clearly.
- If the wallet is locked, explain that the user must run "solobank unlock" in the terminal first.`,
          },
        },
      ],
    }),
  );

  // ── 4. Budget Check ──

  server.prompt(
    'budget-check',
    'Can I afford spending $X?',
    {
      amount: z.string().describe('Dollar amount you are considering spending'),
    },
    ({ amount }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I am considering spending $${amount}. Can I afford it? Please assess my financial situation:

1. Call solobank_balance to retrieve current balances (SOL, USDC, and any other tokens).
2. Call solobank_config with action "show" to check daily limits and usage.
3. If I hold lending positions, call solobank_lending_rates for each active asset to understand locked-up capital.

Then answer:
- Do I have enough liquid funds to cover $${amount} without selling assets?
- What is my total portfolio value, and what percentage would this spend represent?
- Does the amount exceed my per-transaction safeguard limit (maxPerTx)?
- Does it push today's spending over the daily limit (maxDailySend)?
- What would my remaining liquid balance be after the spend?
- Are there any idle funds currently earning no yield that could cover this without disrupting invested positions?
- If funds are tight, suggest which asset or position to liquidate first and why.

Give a clear yes/no recommendation with your reasoning.`,
          },
        },
      ],
    }),
  );

  // ── 5. Morning Briefing ──

  server.prompt(
    'morning-briefing',
    'Daily financial snapshot with balance, positions, rates',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Good morning! Give me a concise daily financial snapshot. Follow these steps:

1. Call solobank_balance for current holdings.
2. Call solobank_lending_rates with asset "USDC" (no protocol filter) to get the best available rate across all protocols.
3. Call solobank_lending_rates with asset "SOL" to get SOL rates.
4. Call solobank_config with action "show" to check daily usage and lock status.

Deliver a brief, scannable briefing covering:
- Total portfolio value (USD equivalent)
- Key balances: SOL and USDC wallet balances
- Active positions: any active lending/borrowing with current APY and estimated daily earnings
- Market rates: best USDC supply APY available today and best SOL supply APY
- Daily limit status: how much of today's send limit has been used
- One top action item for today (e.g. "USDC yield gap: move 500 USDC from Kamino to MarginFi for +0.8% APY")

Keep the briefing under 200 words. Use bullet points. Lead with the most important numbers.`,
          },
        },
      ],
    }),
  );

  // ── 6. What-If ──

  server.prompt(
    'what-if',
    'What if I lend/swap/send X?',
    {
      scenario: z.string().describe('Scenario to analyse, e.g. "lend 1000 USDC to Kamino" or "swap 2 SOL to USDC"'),
    },
    ({ scenario }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run a what-if analysis for this scenario: "${scenario}"

Follow these steps:

1. Call solobank_balance to establish the current baseline portfolio.
2. Depending on the scenario type:
   - For a lend/borrow scenario: call solobank_lending_rates for the relevant asset and protocol(s).
   - For a swap scenario: call solobank_swap_quote with the relevant fromAsset, toAsset, and amount.
   - For a send scenario: call solobank_send with dryRun=true to preview fees and impact.
3. Call solobank_config with action "show" to verify safeguard compliance.

Then model the outcome:
- What would my balances look like after the action?
- What is the financial impact in USD terms (gain, loss, fee cost)?
- For lending: what would annual yield be, and what is the payback period vs. transaction fees?
- For swapping: what is the effective exchange rate, price impact, and fee as a percentage?
- For sending: what is the network fee, and what percentage of the transfer is it?
- Does the action stay within safeguard limits?
- What are the risks or downsides?
- Recommendation: should I proceed, and are there any better alternatives?

Do NOT execute any transactions — this is analysis only.`,
          },
        },
      ],
    }),
  );

  // ── 7. Sweep ──

  server.prompt(
    'sweep',
    'Find idle funds and suggest where to deploy them',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Sweep my account to identify all idle funds and recommend where to deploy them for optimal yield. Steps:

1. Call solobank_balance to list all current holdings.
2. Call solobank_lending_rates with asset "USDC" for Kamino, then MarginFi.
3. Call solobank_lending_rates with asset "SOL" for Kamino, then MarginFi.
4. Call solobank_config with action "show" to understand available daily capacity.

Identify idle funds as:
- Any USDC sitting in the wallet earning 0% (not deployed in lending)
- Any SOL beyond a reasonable reserve (suggest keeping 0.1–0.5 SOL liquid for fees)
- Any other SPL tokens that could be swapped into yield-bearing assets

For each idle balance:
- Name the asset and idle amount
- Calculate the daily and annual opportunity cost at the best available rate
- Recommend the specific action: which protocol, which asset, how much
- Provide the exact tool call sequence to execute the deployment (solobank_lend / solobank_swap + solobank_lend)

Summarise total idle capital and projected annual yield gained if all recommendations are followed. Prioritise actions by largest yield impact.`,
          },
        },
      ],
    }),
  );

  // ── 8. Risk Check ──

  server.prompt(
    'risk-check',
    'Analyze lending position health and risks',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Perform a thorough risk assessment of all lending positions and the overall portfolio. Steps:

1. Call solobank_balance to see all assets including positions.
2. Call solobank_lending_rates for each asset that has an active position (check both Kamino and MarginFi).
3. Call solobank_config with action "show" to review safeguard configuration.

Assess the following risk dimensions:

**Liquidation Risk** (for any borrow positions):
- Current health factor or loan-to-value ratio
- Price drop percentage that would trigger liquidation
- Recommended action if health factor is below 1.5

**Protocol Risk**:
- Smart contract risk for each protocol in use (Kamino, MarginFi)
- Concentration risk: is too much capital in a single protocol?
- Suggest diversification if >80% is in one protocol

**Liquidity Risk**:
- Is sufficient SOL kept liquid for transaction fees (recommend minimum 0.1 SOL)?
- Can positions be unwound quickly if needed?

**Safeguard Configuration Risk**:
- Are per-transaction and daily limits set to appropriate levels?
- Is the wallet unlocked? (flag if so)

**Rate Risk**:
- Are variable rates likely to change significantly? Flag any utilisation rate above 80%.

Conclude with a risk score (Low / Medium / High) and a prioritised action list.`,
          },
        },
      ],
    }),
  );

  // ── 9. Weekly Recap ──

  server.prompt(
    'weekly-recap',
    'Weekly financial summary',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a weekly financial summary for this Solobank wallet. Steps:

1. Call solobank_balance to get current holdings.
2. Call solobank_lending_rates for USDC on both Kamino and MarginFi.
3. Call solobank_lending_rates for SOL on both Kamino and MarginFi.
4. Call solobank_config with action "show" to review limits and usage.

Weekly recap should cover:

**Portfolio Snapshot**
- Current total value and asset breakdown
- Estimated value change narrative (note that historical data may be unavailable; describe current state)

**Yield Performance**
- Active lending positions and current APYs
- Estimated yield earned this week at current rates
- Annualised yield on deployed capital

**Activity Review**
- Daily send limit utilisation pattern (based on current dailyUsed)
- Any safeguard limit concerns

**Market Context**
- Current best rates vs. one week ago (if rate data includes history) or simply current best rates
- Any notable rate movements worth acting on

**Top 3 Actions for Next Week**
- Specific, actionable recommendations with expected impact
- Include exact tool calls needed to execute each action

Keep the tone professional but conversational. Lead with the bottom line.`,
          },
        },
      ],
    }),
  );

  // ── 10. Safeguards ──

  server.prompt(
    'safeguards',
    'Review and explain current security settings',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Review and explain all current Solobank security settings in plain language. Steps:

1. Call solobank_config with action "show" to retrieve all safeguard configuration.
2. Call solobank_balance to understand portfolio size relative to the configured limits.

Then provide a clear explanation covering:

**Current Settings**
- Lock status: is the wallet locked or unlocked? What does each state mean?
- maxPerTx: the maximum any single transaction can send (in dollars). Is this set appropriately for portfolio size?
- maxDailySend: the rolling 24-hour cap on outgoing transfers. Is this reasonable?
- dailyUsed: how much of today's daily limit has been consumed?

**What Each Safeguard Does**
- Explain the per-transaction limit: prevents any single large outgoing transfer
- Explain the daily send limit: stops runaway spending even across many small transactions
- Explain the lock mechanism: a human-only kill switch via "solobank unlock" in terminal
- Explain that the AI agent itself cannot unlock the wallet — only a human terminal session can

**Assessment**
- Are the current limits well-calibrated for the portfolio size?
- Suggest specific adjustments if limits seem too high or too low (give reasoning)
- Explain the MPP (Micropayment Protocol) gateway and how maxPrice protects against overspending on API calls

**How to Update Settings**
- Show the exact solobank_config tool calls to adjust each limit
- Remind the user that locking is done via solobank_lock and unlocking requires the terminal

Format with clear section headers. Use plain English throughout — avoid jargon.`,
          },
        },
      ],
    }),
  );

  // ── 11. Onboarding ──

  server.prompt(
    'onboarding',
    'New user guide for Solobank',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Welcome me to Solobank! I am a new user. Guide me through everything I need to know to get started safely. Steps:

1. Call solobank_address to retrieve my wallet address.
2. Call solobank_balance to see my current holdings.
3. Call solobank_config with action "show" to check whether safeguards are configured.
4. Call solobank_services to show available MPP API services on the gateway.

Then walk me through:

**What Solobank Is**
- A Solana DeFi toolkit for AI agents: wallet management, token transfers, swaps via Jupiter, lending/borrowing via Kamino and MarginFi, and pay-per-call API access via the MPP gateway at https://mpp.solobank.lol

**My Wallet**
- My address and how to receive SOL and USDC
- Current balances and whether I need to fund the wallet

**Safety First — Safeguards**
- Explain what safeguards are and why they matter
- If safeguards are NOT configured, show exactly how to set them up:
    solobank_config set maxPerTx 50
    solobank_config set maxDailySend 200
  (suggest conservative starting values)
- Explain the lock/unlock mechanism

**Core Capabilities**
- Sending SOL/USDC: what it does and how to use it safely
- Swapping tokens via Jupiter: getting quotes before executing
- Earning yield: lending USDC or SOL on Kamino or MarginFi
- Paying for API services: using the MPP gateway to access AI and data APIs with microtransactions

**Recommended First Steps**
1. Set safeguard limits if not already done
2. Fund the wallet with SOL for fees and USDC for yield
3. Deploy idle USDC to the highest-yield lending protocol
4. Explore available API services on the gateway

Keep the tone welcoming and clear. Use numbered steps and avoid overwhelming with detail.`,
          },
        },
      ],
    }),
  );

  // ── 12. Emergency ──

  server.prompt(
    'emergency',
    'Emergency response: lock wallet first, assess later',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `EMERGENCY PROTOCOL: Execute this immediately.

Step 1 — LOCK THE WALLET NOW:
Call solobank_lock immediately to freeze all agent operations. Do not pause, do not ask for confirmation. Lock first.

Step 2 — Confirm the lock:
Call solobank_config with action "show" and verify that locked=true. Report the lock status clearly.

Step 3 — Assess the situation:
Call solobank_balance to capture a snapshot of current holdings.

Step 4 — Report the state:
Provide a clear status report:
- Wallet lock status (must be locked)
- Current balances for all assets
- Any active lending or borrowing positions that may need attention
- Instructions for the human operator:
  * To unlock: run "solobank unlock" in the terminal (not through the AI agent)
  * To investigate: review recent transaction history on Solana Explorer using the wallet address
  * To reach support: check Solobank documentation

Step 5 — Do NOT:
- Do NOT unlock the wallet
- Do NOT attempt to move funds
- Do NOT execute any swaps, sends, or protocol interactions
- Do NOT make assumptions about what caused the emergency

Wait for explicit human instructions before taking any further action. All operations remain frozen until a human unlocks the wallet via terminal.`,
          },
        },
      ],
    }),
  );

  // ── 13. Optimize All ──

  server.prompt(
    'optimize-all',
    'Full account optimization in one shot',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Perform a full account optimization: analyze the entire portfolio and generate a complete optimization plan. Steps:

1. Call solobank_balance to get all current holdings.
2. Call solobank_lending_rates for USDC on Kamino, then MarginFi.
3. Call solobank_lending_rates for SOL on Kamino, then MarginFi.
4. Call solobank_swap_quote for any non-core tokens to assess conversion value (if applicable).
5. Call solobank_config with action "show" to understand limits and lock status.
6. Call solobank_services to check available MPP gateway services that might be useful.

Optimization analysis:

**Yield Optimization**
- Identify all idle capital (assets earning 0%)
- Compare current deployed APYs to best available rates
- Identify any rebalancing opportunities with APY delta > 0.5%
- Calculate total additional annual yield available if all optimizations are applied

**Capital Efficiency**
- Is the right amount of SOL kept liquid for fees (suggest 0.1–0.3 SOL)?
- Should any non-yield-bearing assets be swapped to USDC for lending?
- Are borrow positions cost-effective (borrow rate vs. how the borrowed funds are deployed)?

**Risk Balance**
- Concentration across protocols (recommend no more than 70% in any single protocol)
- Any health factors that need attention

**Complete Action Plan**
List every recommended action in priority order with:
1. Action description
2. Expected impact (APY gain, risk reduction)
3. Exact tool call to execute
4. Estimated transaction fee

Ask for confirmation before executing any action. Present the full plan first.`,
          },
        },
      ],
    }),
  );

  // ── 14. Rebalance Check ──

  server.prompt(
    'rebalance-check',
    'Check if rebalancing between protocols makes sense',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze whether rebalancing lending positions between Kamino and MarginFi makes financial sense right now. Steps:

1. Call solobank_balance to identify current lending positions across protocols.
2. Call solobank_lending_rates for USDC on Kamino.
3. Call solobank_lending_rates for USDC on MarginFi.
4. Call solobank_lending_rates for SOL on Kamino (if SOL is deployed).
5. Call solobank_lending_rates for SOL on MarginFi (if SOL is deployed).
6. Call solobank_config with action "show" to check daily limits.

Rebalance analysis:

**Rate Comparison**
- Current APY on each protocol for each deployed asset
- APY spread between protocols (Kamino vs. MarginFi)

**Break-Even Analysis**
- Estimated transaction cost to withdraw from Protocol A and deposit to Protocol B (Solana fees are low but include it)
- Days to break even on rebalancing cost given the APY differential
- If break-even is under 7 days: recommend rebalancing
- If break-even is 7–30 days: optional, user's preference
- If break-even is over 30 days: not worth it, explain why

**Rebalance Options**
For each asset with a meaningful rate differential (>0.25% APY):
- Current position size and protocol
- Target protocol with higher rate
- Exact tool call: solobank_rebalance with all parameters filled in
- Expected annual yield improvement in dollar terms

**Recommendation**
Give a clear yes/no rebalance recommendation per asset. If rebalancing, provide the complete sequence of tool calls ready to execute upon user approval.`,
          },
        },
      ],
    }),
  );

  // ── 15. API Services ──

  server.prompt(
    'api-services',
    'Browse available pay-per-call API services on the gateway',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Browse and explain all available pay-per-call API services on the Solobank MPP gateway at https://mpp.solobank.lol. Steps:

1. Call solobank_services to retrieve the full list of available services, endpoints, and pricing.
2. Call solobank_balance to check available USDC for API spending.
3. Call solobank_config with action "show" to review the per-transaction limit applicable to API payments.

Then provide:

**Gateway Overview**
- Explain the MPP (Micropayment Protocol): pay per API call in USDC, no subscriptions, no API keys needed
- Gateway URL: https://mpp.solobank.lol
- How pricing works: each endpoint has a cost in USDC, charged only when the call succeeds

**Available Services**
For each service returned by solobank_services, describe:
- Service name and category (AI, data, analytics, etc.)
- Available endpoints and their per-call cost in USDC
- What the service does and typical use cases
- Example solobank_pay tool call to use this service

**Cost Estimation**
- At current USDC balance, how many API calls can be made?
- Which services are cost-effective for common AI agent workflows?
- Recommended maxPrice setting for each service type

**How to Use a Service**
Show a concrete example solobank_pay call with:
- url pointing to an mpp.solobank.lol endpoint
- appropriate method and body
- maxPrice set conservatively

Note that solobank_pay will refuse internal/private URLs and enforces the per-transaction safeguard limit.`,
          },
        },
      ],
    }),
  );

  // ── 16. Savings Goal ──

  server.prompt(
    'savings-goal',
    'Plan savings toward a target',
    {
      target: z.string().describe('Savings target amount in USD, e.g. "5000"'),
      timeframe: z.string().describe('Timeframe to reach the goal, e.g. "6 months" or "1 year"'),
    },
    ({ target, timeframe }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Help me create a savings plan to reach $${target} within ${timeframe}. Steps:

1. Call solobank_balance to see my current holdings and starting point.
2. Call solobank_lending_rates for USDC on Kamino and MarginFi to get current yield rates.
3. Call solobank_lending_rates for SOL on both protocols.
4. Call solobank_config with action "show" to review current limits and daily usage.

Savings plan analysis:

**Current Position**
- Current USDC and SOL balances (USD equivalent)
- Gap between current holdings and target of $${target}
- Amount already saved toward goal

**Yield-Accelerated Savings Plan**
- Best available APY for USDC right now (from the rate data)
- How much of the gap can be closed by yield alone over ${timeframe} with current deployed capital
- How much additional regular contribution is needed per week/month to hit the target on time
- Projected balance at end of ${timeframe} with and without additional contributions

**Optimized Deployment Strategy**
- Recommended asset allocation for the savings goal (USDC in lending for stability)
- Which protocol to use and why (best APY, risk-adjusted)
- Whether to keep any SOL exposure or convert to USDC for predictable yield

**Milestone Plan**
Break the ${timeframe} into quarters with:
- Target balance at each milestone
- Expected yield contribution at each stage
- Actions needed to stay on track

**Action Plan to Start**
1. Exact tool calls to deploy current idle USDC into the recommended lending protocol
2. Suggested monthly contribution amount
3. How to track progress using solobank_balance

Conclude with an honest assessment: is the $${target} goal in ${timeframe} realistic given current balances and yield rates?`,
          },
        },
      ],
    }),
  );
}
