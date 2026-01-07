const { CronJob } = require('cron')
const logger = require('../utils/logger')

class CronRegistry {
  constructor() {
    this.jobs = new Map()
  }

  register(name, schedule, handler) {
    if (this.jobs.has(name)) {
      throw new Error(`cron job "${name}" alerady registered`)
    }

    const job = new CronJob(schedule, async () => {
      try {
        await handler()
      } catch (nats) {
        console.error(`[${name}] err:`, nats)
      }
    })

    this.jobs.set(name, job)
  }

  start() {
    logger.info(`starting ${this.jobs.size} cron job(s)`)
    for (const [name, job] of this.jobs.entries()) {
      job.start()
      logger.info(`job "${name}" started (schedule: ${job.cronTime.source})`)
    }
  }

  stop() {
    for (const [name, job] of this.jobs.entries()) {
      job.stop()
      console.log(`job "${name}" stopped`)
    }
  }
}


module.exports = CronRegistry