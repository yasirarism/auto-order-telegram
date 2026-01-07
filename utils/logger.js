const winston = require('winston')
const { default: chalk } = require('chalk')
const util = require('util')
const path = require('path')
require('dotenv').config({quiet: true})


const LEVELS = { error: 0, info: 1, warn: 2, debug: 3 }
const ORDER  = ['error', 'info', 'warn', 'debug'] 

const normalizeLevel = (v) => {
  const s = String(v || '').toLowerCase().trim()
  if (s === 'silent' || s === 'off' || s === 'none') return 'silent'
  return ORDER.includes(s) ? s : null
}

const RAW_LEVEL =
  normalizeLevel(process.env.LOG_LEVEL) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

const ACTIVE_LEVEL = RAW_LEVEL === 'silent' ? 'error' : RAW_LEVEL 
const IS_SILENT = RAW_LEVEL === 'silent'

const colorizeLevel = (level) => {
  switch (level) {
    case 'error': return chalk.red(level.toUpperCase())
    case 'warn' : return chalk.yellow(level.toUpperCase())
    case 'info' : return chalk.green(level.toUpperCase())
    case 'debug': return chalk.blue(level.toUpperCase())
    default     : return chalk.gray(level.toUpperCase())
  }
}

const colorizeFirstArg = (level, arg, idx) => {
  if (idx !== 0 || typeof arg !== 'string') return arg
  switch (level) {
    case 'error': return chalk.red(arg)
    case 'warn' : return chalk.yellow(arg)
    case 'info' : return chalk.green(arg)
    case 'debug': return chalk.blue(arg)
    default     : return chalk.gray(arg)
  }
}

const toMessage = (level, args) => {
  const colored = args.map((a, i) => colorizeFirstArg(level, a, i))
  const msg = util.formatWithOptions({ colors: true, depth: null, compact: false }, ...colored)
  const errs = args.filter(a => a instanceof Error)
  if (errs.length === 0) return msg
  const stacks = errs.map(e => e.stack || e.message || String(e)).filter(Boolean).join('\n')
  if (!msg) return stacks
  if (stacks.includes(msg)) return stacks
  return `${msg}\n${stacks}`
}

const consoleTransport = new winston.transports.Console({
  level: ACTIVE_LEVEL,
  silent: IS_SILENT,
})

const LOG_FILE = process.env.LOG_FILE || path.resolve(process.cwd(), 'app.log')
const fileTransport = new winston.transports.File({
  filename: LOG_FILE,
  level: 'debug',   
  silent: IS_SILENT,
  options: { flags: 'a' },
})

const baseLogger = winston.createLogger({
  level: ACTIVE_LEVEL,
  levels: LEVELS,
  silent: IS_SILENT, 
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => {
      const ts = typeof info.timestamp === 'string' ? info.timestamp : ''
      const lvl = typeof info.level === 'string' ? info.level : 'info'
      const msg = typeof info.message === 'string' ? info.message : String(info.message)
      return `[${chalk.gray(ts)}] ${colorizeLevel(lvl)} | ${msg}`
    })
  ),
  transports: [consoleTransport, fileTransport],
})

const logger = baseLogger
ORDER.forEach(level => {
  const original = baseLogger[level].bind(baseLogger)
  logger[level] = (...args) => {
    if (IS_SILENT) return 
    const message = toMessage(level, args)
    return original(message)
  }
})

module.exports = logger
module.exports.log = logger
module.exports.logger = logger
module.exports.default = logger
