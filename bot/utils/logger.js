import { env } from '../config/env.js';

/**
 * Logger utility with debug mode toggle
 *
 * Provides centralized logging with environment-based debug mode control.
 * Debug logs only appear when DEBUG_MODE=true in .env file.
 *
 * @example
 * import { logger } from './utils/logger.js';
 *
 * // Always visible logs
 * logger.info('Server started');
 * logger.success('Operation completed');
 * logger.warn('Warning message');
 * logger.error('Error occurred', error);
 *
 * // Debug-only logs (only when DEBUG_MODE=true)
 * logger.debug('Debug info:', data);
 * logger.button('button_id', userId, { extra: 'data' });
 */
class Logger {
  /**
   * Initialize logger with debug mode from environment
   * @private
   */
  constructor() {
    this.debugMode = env.DEBUG_MODE || false;
  }

  /**
   * Log debug messages (only shown when DEBUG_MODE=true)
   * Use for detailed debugging information during development
   *
   * @param {...any} args - Any number of arguments to log
   * @example
   * logger.debug('Processing data:', { userId, status });
   */
  debug(...args) {
    if (this.debugMode) {
      console.log('🔍 [DEBUG]', ...args);
    }
  }

  /**
   * Log informational messages (always shown)
   * Use for general operational information
   *
   * @param {...any} args - Any number of arguments to log
   * @example
   * logger.info('Registering 3 commands...');
   */
  info(...args) {
    console.log('ℹ️  [INFO]', ...args);
  }

  /**
   * Log success messages (always shown)
   * Use for successful operations and completions
   *
   * @param {...any} args - Any number of arguments to log
   * @example
   * logger.success('User registered successfully');
   */
  success(...args) {
    console.log('✅ [SUCCESS]', ...args);
  }

  /**
   * Log warning messages (always shown)
   * Use for non-critical issues that should be noted
   *
   * @param {...any} args - Any number of arguments to log
   * @example
   * logger.warn('Unknown command:', commandName);
   */
  warn(...args) {
    console.warn('⚠️  [WARN]', ...args);
  }

  /**
   * Log error messages (always shown)
   * Use for errors and exceptions that need attention
   *
   * @param {...any} args - Any number of arguments to log
   * @example
   * logger.error('Database connection failed:', error);
   */
  error(...args) {
    console.error('❌ [ERROR]', ...args);
  }

  /**
   * Log Discord interaction details (debug only)
   * Use for generic interaction logging
   *
   * @param {string} type - Type of interaction (button, select, modal, etc.)
   * @param {string} customId - The custom ID of the interaction component
   * @param {Object} [details={}] - Additional details about the interaction
   * @example
   * logger.interaction('button', 'create_trade_btn', { userId: '123' });
   */
  interaction(type, customId, details = {}) {
    if (this.debugMode) {
      console.log('🔍 [INTERACTION]', {
        type,
        customId,
        ...details,
      });
    }
  }

  /**
   * Log button interaction (debug only)
   * Use when a user clicks a button component
   *
   * @param {string} customId - The custom ID of the button
   * @param {string} userId - The Discord user ID who clicked
   * @param {Object} [details={}] - Additional context about the click
   * @example
   * logger.button('role_btn:buyer', interaction.user.id, { role: 'buyer' });
   */
  button(customId, userId, details = {}) {
    if (this.debugMode) {
      console.log('🔘 [BUTTON]', {
        customId,
        userId,
        ...details,
      });
    }
  }

  /**
   * Log select menu interaction (debug only)
   * Use when a user makes a selection from a dropdown
   *
   * @param {string} customId - The custom ID of the select menu
   * @param {string} userId - The Discord user ID who selected
   * @param {string[]} values - Array of selected values
   * @param {Object} [details={}] - Additional context about the selection
   * @example
   * logger.select('select_counterparty_slt:buyer', userId, ['123'], { action: 'select' });
   */
  select(customId, userId, values, details = {}) {
    if (this.debugMode) {
      console.log('📋 [SELECT]', {
        customId,
        userId,
        values,
        ...details,
      });
    }
  }

  /**
   * Log modal submission (debug only)
   * Use when a user submits a modal form
   *
   * @param {string} customId - The custom ID of the modal
   * @param {string} userId - The Discord user ID who submitted
   * @param {Object} [fields={}] - The field values from the modal
   * @example
   * logger.modal('trade_details_mdl', userId, { item: 'Knife', price: '50' });
   */
  modal(customId, userId, fields = {}) {
    if (this.debugMode) {
      console.log('📝 [MODAL]', {
        customId,
        userId,
        fields,
      });
    }
  }

  /**
   * Log slash command execution (debug only)
   * Use when a user executes a slash command
   *
   * @param {string} commandName - The name of the command executed
   * @param {string} userId - The Discord user ID who executed the command
   * @param {Object} [options={}] - Command options/parameters
   * @example
   * logger.command('create_trade', interaction.user.id, { channelId: '123' });
   */
  command(commandName, userId, options = {}) {
    if (this.debugMode) {
      console.log('⚡ [COMMAND]', {
        commandName,
        userId,
        options,
      });
    }
  }

  /**
   * Check if debug mode is currently enabled
   * Useful for conditionally executing expensive debug operations
   *
   * @returns {boolean} True if DEBUG_MODE=true in environment
   * @example
   * if (logger.isDebugMode()) {
   *   const expensiveData = generateReport();
   *   logger.debug('Report:', expensiveData);
   * }
   */
  isDebugMode() {
    return this.debugMode;
  }
}

/**
 * Singleton logger instance
 * Import and use this throughout the application for consistent logging
 *
 * @type {Logger}
 * @example
 * import { logger } from './utils/logger.js';
 * logger.info('Application started');
 */
export const logger = new Logger();
