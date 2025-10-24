import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { query } from "../utils/db.js";

export const data = new SlashCommandBuilder()
  .setName("healthcheck")
  .setDescription("Check database connectivity and basic readiness");

export async function execute(interaction) {
  const started = Date.now();
  let dbOk = false;
  let flowsOk = false;
  let details = [];

  try {
    // Basic connectivity check
    const resNow = await query("SELECT NOW() as now");
    dbOk = Array.isArray(resNow.rows) && resNow.rows.length > 0;

    // Check if the 'flows' table from migrations exists
    const resFlows = await query(
      "SELECT to_regclass('public.flows') AS flows_table",
    );
    const flowsTable = resFlows?.rows?.[0]?.flows_table || null;
    flowsOk = Boolean(flowsTable);

    details.push(`DB time: ${resNow.rows[0].now}`);
    details.push(`flows table: ${flowsTable ? "present" : "missing"}`);
  } catch (err) {
    details.push(`DB error: ${err?.message || String(err)}`);
  }

  const duration = Date.now() - started;

  const lines = [
    `Database: ${dbOk ? "OK ✅" : "FAILED ❌"}`,
    `Migrations (flows): ${flowsOk ? "OK ✅" : "MISSING ⚠️"}`,
    `Latency: ${duration}ms`,
    ...details.map((d) => `- ${d}`),
  ];

  const content = lines.join("\n");

  try {
    await interaction.reply({
      content: "Healthcheck\n```\n" + content + "\n```",
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    // If the interaction was already acknowledged differently, try edit
    try {
      await interaction.editReply({
        content: "Healthcheck\n```\n" + content + "\n```",
      });
    } catch {
      // swallow
    }
  }
}
