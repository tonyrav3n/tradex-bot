// setup.js
import { Client, GatewayIntentBits, PermissionsBitField } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  if (!guild) return console.log("Guild not found. Check GUILD_ID in .env");

  console.log(`Setting up TradeNest server: ${guild.name}`);
  await guild.roles.fetch();
  await guild.channels.fetch();

  // === 1. DELETE ALL CHANNELS ===
  for (const channel of guild.channels.cache.values()) {
    if (!channel.deletable) {
      console.log(`Skipping undeletable channel: ${channel.name}`);
      continue;
    }
    try {
      await channel.delete();
    } catch (err) {
      console.log(`Could not delete ${channel.name}: ${err.message}`);
    }
  }

  // === 2. DELETE ALL ROLES EXCEPT BOT & @everyone ===
  for (const role of guild.roles.cache.values()) {
    if (!role.editable || role.name === "@everyone") {
      console.log(`Skipping undeletable role: ${role.name}`);
      continue;
    }
    try {
      await role.delete();
    } catch (err) {
      console.log(`Could not delete ${role.name}: ${err.message}`);
    }
  }

  // === 3. CREATE ROLES ===
  const roles = {};
  const roleData = [
    ["Founder", 0xffd700, [PermissionsBitField.Flags.Administrator]],
    ["Admin", 0x4169e1, [PermissionsBitField.Flags.Administrator]],
    ["Contributor", 0x00ffff, []],
    ["Moderator", 0x9b59b6, []],
    ["Beta Tester", 0x2ecc71, []],
    ["Community Member", 0x95a5a6, []],
    ["Muted", null, []],
  ];

  for (const [name, color, perms] of roleData) {
    roles[name] = await guild.roles.create({
      name,
      color,
      permissions: perms,
      reason: "TradeNest setup",
    });
  }

  const everyone = guild.roles.everyone;

  // === 4. CATEGORY + CHANNEL STRUCTURE ===
  const categories = {
    WELCOME: [["🏠・welcome"], ["📜・rules"], ["📢・announcements"]],
    "BOT-SUPPORT": [
      ["🤖・bot-commands"],
      ["📘・how-to-use"],
      ["❓・faq"],
      ["🎟️・support"],
    ],
    DEVELOPMENT: [["🧠・dev-updates"], ["💡・ideas-lab"], ["🐞・bugs"]],
    COMMUNITY: [["💬・general"], ["⭐・feedback"]],
  };

  for (const [catName, chans] of Object.entries(categories)) {
    const category = await guild.channels.create({ name: catName, type: 4 });
    for (const [chanName] of chans) {
      const channel = await guild.channels.create({
        name: chanName,
        type: 0,
        parent: category,
      });

      if (catName === "DEVELOPMENT") {
        await channel.permissionOverwrites.set([
          { id: everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: roles["Founder"],
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: roles["Admin"],
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: roles["Contributor"],
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
        ]);
      } else {
        await channel.permissionOverwrites.set([
          {
            id: roles["Muted"],
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AddReactions,
            ],
          },
        ]);
      }

      if (chanName.includes("announcements")) {
        await channel.permissionOverwrites.edit(roles["Founder"], {
          SendMessages: true,
        });
        await channel.permissionOverwrites.edit(roles["Admin"], {
          SendMessages: true,
        });
        await channel.permissionOverwrites.edit(everyone, {
          SendMessages: false,
        });
      }
    }
  }

  console.log("✅ TradeNest server setup complete.");
  setTimeout(() => process.exit(0), 2000);
});

client.login(process.env.TOKEN);
