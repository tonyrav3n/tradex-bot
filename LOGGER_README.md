# Logger Utility Documentation

## Overview

The logger utility provides a centralized logging system with debug mode toggle for the Discord bot. All logging can be controlled via the `DEBUG_MODE` environment variable.

## Setup

### 1. Environment Variable

Add to your `.env` file:

```env
# Debug Mode - Set to 'true' to enable debug logging
DEBUG_MODE=false
```

- **`DEBUG_MODE=true`**: Shows all logs including debug messages
- **`DEBUG_MODE=false`**: Shows only important logs (info, success, warn, error)

### 2. Import the Logger

```javascript
import { logger } from './utils/logger.js';
```

## Available Methods

### Always Visible (Production Logs)

These methods always display output regardless of `DEBUG_MODE`:

#### `logger.info(...args)`
General informational messages.
```javascript
logger.info('Server started on port 3000');
logger.info('Processing request:', { userId: '123' });
```

#### `logger.success(...args)`
Success messages.
```javascript
logger.success('User registered successfully');
logger.success(`Logged in as ${client.user.tag}`);
```

#### `logger.warn(...args)`
Warning messages.
```javascript
logger.warn('Rate limit approaching');
logger.warn('Unknown command:', commandName);
```

#### `logger.error(...args)`
Error messages.
```javascript
logger.error('Database connection failed:', error);
logger.error('Failed to process payment:', error.message);
```

### Debug Only (Development Logs)

These methods only display when `DEBUG_MODE=true`:

#### `logger.debug(...args)`
General debug information.
```javascript
logger.debug('Processing data:', data);
logger.debug('User state:', { userId, status, role });
```

#### `logger.interaction(type, customId, details)`
Log Discord interaction details.
```javascript
logger.interaction('button', 'create_trade_btn', {
  userId: interaction.user.id,
  guildId: interaction.guildId
});
```

#### `logger.button(customId, userId, details)`
Log button interactions.
```javascript
logger.button('role_btn:buyer', interaction.user.id, {
  role: 'buyer'
});
```

#### `logger.select(customId, userId, values, details)`
Log select menu interactions.
```javascript
logger.select(
  'select_counterparty_slt:buyer',
  interaction.user.id,
  interaction.values,
  { action: 'select_counterparty' }
);
```

#### `logger.modal(customId, userId, fields)`
Log modal submissions.
```javascript
logger.modal('trade_details_mdl', interaction.user.id, {
  item: itemValue,
  price: priceValue
});
```

#### `logger.command(commandName, userId, options)`
Log command executions.
```javascript
logger.command('create_trade', interaction.user.id, {
  channelId: interaction.channelId
});
```

#### `logger.isDebugMode()`
Check if debug mode is enabled.
```javascript
if (logger.isDebugMode()) {
  // Perform expensive debug operations
  const debugData = generateDebugReport();
  logger.debug('Debug report:', debugData);
}
```

## Usage Examples

### In Event Handlers

```javascript
// bot/events/interactionCreate.js
import { logger } from '../utils/logger.js';

export async function execute(client, interaction) {
  if (interaction.isChatInputCommand()) {
    logger.command(interaction.commandName, interaction.user.id);
    
    try {
      await command.execute(interaction);
      logger.success(`Command ${interaction.commandName} executed`);
    } catch (error) {
      logger.error(`Error executing command:`, error);
    }
  }

  if (interaction.isButton()) {
    logger.button(interaction.customId, interaction.user.id);
    await handleButton(interaction);
  }
}
```

### In Command Files

```javascript
// bot/commands/create_trade.js
import { logger } from '../utils/logger.js';

export async function execute(interaction) {
  logger.debug('Create trade command started:', {
    userId: interaction.user.id,
    guildId: interaction.guildId
  });

  try {
    await interaction.reply({ ... });
    logger.success('Trade creation prompt sent');
  } catch (error) {
    logger.error('Failed to send trade prompt:', error);
  }
}
```

### In Handlers

```javascript
// bot/handlers/buttonsHandler.js
import { logger } from '../utils/logger.js';

async function handleRoleSelection(interaction, role) {
  logger.button(`role_btn:${role}`, interaction.user.id, { role });
  logger.debug('User selected role:', { role, userId: interaction.user.id });

  try {
    await interaction.update({ ... });
    logger.success('Role selection updated');
  } catch (error) {
    logger.error('Failed to update role selection:', error);
  }
}
```

## Output Examples

### With `DEBUG_MODE=false` (Production)

```
✅ [SUCCESS] Logged in as amis.#0830
ℹ️  [INFO] Serving 1 guild(s)
ℹ️  [INFO] Registering 3 application (/) commands...
✅ [SUCCESS] Successfully registered 3 guild commands
✅ [SUCCESS] Bot is ready and operational!
⚠️  [WARN] Unknown select action: unknown_action
❌ [ERROR] Error showing modal: TypeError: ...
```

### With `DEBUG_MODE=true` (Development)

```
✅ [SUCCESS] Logged in as amis.#0830
ℹ️  [INFO] Serving 1 guild(s)
🔍 [DEBUG] Prepared command for registration: create_trade
🔍 [DEBUG] Prepared command for registration: say
🔍 [DEBUG] Prepared command for registration: verify_setup
ℹ️  [INFO] Registering 3 application (/) commands...
✅ [SUCCESS] Successfully registered 3 guild commands
✅ [SUCCESS] Bot is ready and operational!
⚡ [COMMAND] { commandName: 'create_trade', userId: '123456789', options: {} }
🔘 [BUTTON] { customId: 'create_trade_flow_btn', userId: '123456789' }
🔘 [BUTTON] { customId: 'role_btn:buyer', userId: '123456789', role: 'buyer' }
📋 [SELECT] { customId: 'select_counterparty_slt:buyer', userId: '123456789', values: ['987654321'] }
🔍 [DEBUG] Showing trade details modal: { role: 'buyer', selectedUserId: '987654321' }
✅ [SUCCESS] Modal shown successfully
```

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// ❌ Wrong - using debug for errors
logger.debug('Critical database error:', error);

// ✅ Correct - use error for errors
logger.error('Critical database error:', error);
```

### 2. Include Context in Debug Logs

```javascript
// ❌ Wrong - not enough context
logger.debug('Processing...');

// ✅ Correct - include relevant data
logger.debug('Processing trade:', {
  tradeId,
  buyerId,
  sellerId,
  amount
});
```

### 3. Don't Log Sensitive Information

```javascript
// ❌ Wrong - logging sensitive data
logger.debug('User credentials:', {
  password: user.password,
  apiKey: process.env.API_KEY
});

// ✅ Correct - omit sensitive data
logger.debug('User login attempt:', {
  userId: user.id,
  username: user.username
});
```

### 4. Use Structured Data

```javascript
// ❌ Wrong - hard to parse
logger.debug(`User ${userId} selected ${role} for trade ${tradeId}`);

// ✅ Correct - structured object
logger.debug('User role selection:', {
  userId,
  role,
  tradeId
});
```

## Performance Considerations

Debug logs have minimal performance impact when `DEBUG_MODE=false` because the checks happen before any string formatting or object serialization:

```javascript
// This is efficient - the expensive operation only runs if debug is enabled
if (logger.isDebugMode()) {
  const expensiveData = generateLargeReport(); // Only runs if debug mode
  logger.debug('Report:', expensiveData);
}
```

## Migration from console.log

Replace existing console logs:

```javascript
// Before
console.log('User logged in');           // → logger.info('User logged in');
console.log('Debug info:', data);        // → logger.debug('Debug info:', data);
console.warn('Warning!');                 // → logger.warn('Warning!');
console.error('Error:', error);           // → logger.error('Error:', error);
```

## Toggling Debug Mode

### During Development
```bash
# In your .env file
DEBUG_MODE=true
```

### In Production
```bash
# In your .env file or hosting platform
DEBUG_MODE=false
```

### Runtime Check
```javascript
console.log('Debug mode:', logger.isDebugMode() ? 'enabled' : 'disabled');
```

## Troubleshooting

### Debug logs not showing?
1. Check `.env` file has `DEBUG_MODE=true`
2. Restart the bot after changing `.env`
3. Verify logger is imported correctly

### All logs showing even with DEBUG_MODE=false?
1. Check for typos in `.env`: `DEBUG_MODE=true` (not `DEBUG_MODE=True` or `DEBUG_MODE=1`)
2. Clear any cached environment variables
3. Verify `env.js` is reading the value correctly

---

**Created:** 2025-01-XX  
**Last Updated:** 2025-01-XX  
**Maintainer:** amis-bot-rebuild team
