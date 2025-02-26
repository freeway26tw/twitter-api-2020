'use strict'
const { User } = require('../models')
const faker = require('faker')

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const userData = await User.findAndCountAll()
    const tweetSeedData = Array.from({ length: 10 * userData.count }).map((_, i) => {
      const userId = userData.rows[Math.floor(i / 10)].dataValues.id
      return {
        user_id: userId,
        description: faker.lorem.paragraph(),
        created_at: faker.date.past(),
        updated_at: faker.date.recent()
      }
    })

    await queryInterface.bulkInsert('Tweets', tweetSeedData)
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Tweets', {})
  }
}
