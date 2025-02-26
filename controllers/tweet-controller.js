const { Tweet, Like, Reply, User, sequelize } = require('../models')
const helpers = require('../_helpers')
const dayjs = require('dayjs')
require('dayjs/locale/zh-tw')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const relativeTime = require('dayjs/plugin/relativeTime')

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)

const createError = require('http-errors')

const tweetController = {
  getTweets: (req, res, next) => {
    const userId = helpers.getUser(req).id

    return Promise.all([
      Tweet.findAll({
        order: [['created_at', 'desc']],
        include: [{ model: User, attributes: ['account', 'name', 'avatar'] }],
        attributes: {
          include: [
            [
              sequelize.literal(
                '(SELECT COUNT(*) FROM `Likes` WHERE `Likes`.`tweet_id` = `Tweet`.`id`)'
              ),
              'likesNum'
            ],
            [
              sequelize.literal(
                '(SELECT COUNT(*) FROM `Replies` WHERE `Replies`.`tweet_id` = `Tweet`.`id`)'
              ),
              'repliesNum'
            ]
          ]
        },
        nest: true,
        raw: true
      }),
      Like.findAll({
        where: {
          user_id: userId
        }
      })
    ])
      .then(([tweets, likes]) => {
        const result = tweets.map(tweet => ({
          ...tweet,
          isLiked: likes.some(like => like.TweetId === tweet.id)
        }))

        return res.json(result)
      })
      .catch(error => next(error))
  },

  getTweet: (req, res, next) => {
    const userId = helpers.getUser(req).id

    return Promise.all([
      Tweet.findByPk(req.params.tweetId, {
        include: [{ model: User, attributes: ['account', 'name', 'avatar'] }],
        attributes: {
          include: [
            [
              sequelize.literal(
                '(SELECT COUNT(*) FROM `Likes` WHERE `Likes`.`tweet_id` = `Tweet`.`id`)'
              ),
              'likesNum'
            ],
            [
              sequelize.literal(
                '(SELECT COUNT(*) FROM `Replies` WHERE `Replies`.`tweet_id` = `Tweet`.`id`)'
              ),
              'repliesNum'
            ]
          ]
        }
      }),
      Like.findAll({
        where: {
          user_id: userId
        }
      })
    ])
      .then(([tweet, likes]) => {
        if (!tweet) throw createError(404, "Tweet doesn't exist!")

        const tweetData = tweet.toJSON()
        tweetData.isLiked = likes.some(like => like.TweetId === tweet.id)

        tweetData.diffTime = dayjs(tweetData.createdAt)
          .tz('Asia/Taipei')
          .locale('zh-tw')
          .fromNow()
        tweetData.createdAt = dayjs(tweetData.createdAt)
          .tz('Asia/Taipei')
          .locale('zh-tw')
          .format('A h:mm ‧ YYYY年M月D日')
          .replace('AM', '上午')
          .replace('PM', '下午')

        return res.json(tweetData)
      })
      .catch(error => next(error))
  },

  postTweet: (req, res, next) => {
    const { description } = req.body

    if (description.length > 140) { throw createError(422, "Description can't more than 140 words!") }
    if (!description.trim()) throw (createError(400, 'Description is required!'))

    return Tweet.create({
      description,
      UserId: helpers.getUser(req).id
    })
      .then(newTweet => {
        const tweetData = newTweet.toJSON()
        const { account, name, avatar } = req.user

        tweetData.repliesNum = 0
        tweetData.likesNum = 0
        tweetData.User = { account, name, avatar }
        tweetData.isLiked = false
        return res.json(tweetData)
      })
      .catch(error => next(error))
  },

  getReplies: (req, res, next) => {
    return Reply.findAll({
      where: {
        TweetId: req.params.tweetId
      },
      include: [{ model: User, attributes: ['account', 'name', 'avatar'] }],
      raw: true,
      nest: true
    })
      .then(replies => res.json(replies))
      .catch(error => next(error))
  },

  postReply: (req, res, next) => {
    const { comment } = req.body

    if (comment.length > 140) throw (createError(422, "Comment can't more than 140 words!"))
    if (!comment.trim()) throw (createError(400, 'Comment is requires!'))

    return Reply.create({
      UserId: helpers.getUser(req).id,
      comment,
      TweetId: req.params.tweetId
    })
      .then(newReply => res.json(newReply))
      .catch(error => next(error))
  },

  addLike: (req, res, next) => {
    const { tweetId } = req.params

    return Promise.all([
      Tweet.findByPk(tweetId),
      Like.findOne({
        where: {
          UserId: helpers.getUser(req).id,
          TweetId: tweetId
        }
      })
    ])
      .then(([tweet, like]) => {
        if (!tweet) throw (createError(404, "Tweet doesn't exist!"))

        if (like) throw (createError(409, 'You already liked this tweet!'))

        return Like.create({
          UserId: helpers.getUser(req).id,
          TweetId: tweetId
        })
      })
      .then(newLike => res.json(newLike))
      .catch(error => next(error))
  },

  removeLike: (req, res, next) => {
    return Like.findOne({
      where: {
        UserId: helpers.getUser(req).id,
        TweetId: req.params.tweetId
      }
    })
      .then(like => {
        if (!like) throw (createError(404, "You haven't liked this tweet!"))

        return like.destroy()
      })
      .then(deletedLike => res.json(deletedLike))
      .catch(error => next(error))
  }
}

module.exports = tweetController
