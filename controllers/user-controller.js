const { User, sequelize } = require('../models')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const createError = require('http-errors')
const helpers = require('../_helpers')

const userController = {
  getUser: (req, res, next) => {
    return sequelize.query(`
    SELECT id, email, account, name, avatar, cover_url coverUrl, introduction, role, created_at createdAt, updated_at updatedAt, IFNULL(followingNum, 0) followingNum, IFNULL(followerNum, 0) followerNum
FROM Users u
LEFT JOIN (
SELECT follower_id, COUNT(1) followingNum 
FROM Followships 
GROUP BY follower_id) f_ing ON id = follower_id
LEFT JOIN (
SELECT following_id, COUNT(1) followerNum 
FROM Followships 
GROUP BY following_id) f_er ON id = following_id
WHERE id = :userId
ORDER BY u.created_at DESC
    `,
    {
      replacements: { userId: req.params.userId },
      type: sequelize.QueryTypes.SELECT
    })
      .then(user => {
        return res.json(user[0])
      })
      .catch(error => next(error))
  },

  getUserTweets: (req, res, next) => {
    return sequelize.query(`
SELECT account, avatar, name, u.id UserId, t.id TweetId, description, !ISNULL(like_tweet.tweet_id) isLiked, IFNULL(likesNum, 0) likesNum, IFNULL(repliesNum, 0) repliesNum, t.created_at createdAt
FROM Tweets t 
LEFT JOIN(SELECT tweet_id FROM Likes WHERE user_id = :ownId) like_tweet ON t.id = like_tweet.tweet_id 
LEFT JOIN(SELECT l.tweet_id, COUNT(tweet_id) likesNum
FROM Likes l 
JOIN Tweets t ON l.tweet_id = t.id
WHERE t.user_id = :userId
GROUP BY l.tweet_id) t_like ON t.id = t_like.tweet_id
LEFT JOIN(SELECT tweet_id, COUNT(r.user_id) repliesNum FROM Replies r 
JOIN Tweets t ON r.tweet_id = t.id
WHERE t.user_id = :userId
GROUP BY tweet_id) t_reply ON t.id = t_reply.tweet_id
JOIN Users u ON t.user_id = u.id
WHERE t.user_id = :userId
ORDER BY t.created_at DESC
`,
    {
      replacements: { userId: req.params.userId, ownId: helpers.getUser(req).id },
      type: sequelize.QueryTypes.SELECT
    })
      .then(tweets => {
        return res.json(tweets)
      })
      .catch(error => next(error))
  },

  getUserReplies: (req, res, next) => {
    return sequelize.query(`
    SELECT r.tweet_id TweetId, comment, account, created_at createdAt
FROM Replies r
LEFT JOIN (SELECT t.id tweet_id, user_id, account FROM Tweets t JOIN Users u ON t.user_id = u.id) t_account USING (tweet_id)
WHERE r.user_id = :userId
ORDER BY created_at LIMIT 5
    `,
    {
      replacements: { userId: req.params.userId },
      type: sequelize.QueryTypes.SELECT
    })
      .then(replies => {
        return res.json(replies)
      })
      .catch(error => next(error))
  },

  getUserLikes: (req, res, next) => {
    return sequelize.query(`
    SELECT u.id UserId, l.tweet_id TweetId, !ISNULL(ownLike.tweet_id) isLiked, description, IFNULL(likesNum, 0) likesNum, IFNULL(repliesNum, 0) repliesNum, t.created_at createdAt, avatar, name, account
FROM Likes l 
LEFT JOIN (SELECT tweet_id FROM Likes WHERE user_id = :ownId) ownLike USING(tweet_id)
JOIN Tweets t ON t.id = l.tweet_id
LEFT JOIN(SELECT l.tweet_id, COUNT(tweet_id) likesNum
FROM Likes l 
JOIN Tweets t ON l.tweet_id = t.id
GROUP BY l.tweet_id) t_like USING(tweet_id)
LEFT JOIN(SELECT tweet_id, COUNT(r.user_id) repliesNum FROM Replies r 
JOIN Tweets t ON r.tweet_id = t.id
GROUP BY tweet_id) t_reply USING(tweet_id)
JOIN Users u ON t.user_id = u.id
WHERE l.user_id = :userId
ORDER BY l.created_at DESC
    `,
    {
      replacements: { userId: req.params.userId, ownId: helpers.getUser(req).id },
      type: sequelize.QueryTypes.SELECT
    })
      .then(likes => {
        return res.json(likes)
      })
      .catch(error => next(error))
  },

  getUserFollowers: (req, res, next) => {
    return sequelize.query(`
    SELECT follower_id followerId, !ISNULL(own_follow) isFollowed, avatar, name, introduction
FROM Followships f1 
LEFT JOIN (SELECT following_id own_follow, created_at FROM Followships WHERE follower_id = :ownId) follow 
ON follower_id = own_follow
JOIN Users u ON u.id = follower_id 
WHERE f1.following_id = :userId
ORDER BY follow.created_at DESC
    `,
    {
      replacements: { userId: req.params.userId, ownId: helpers.getUser(req).id },
      type: sequelize.QueryTypes.SELECT
    })
      .then(followers => res.json(followers))
      .catch(error => next(error))
  },

  getUserFollowings: (req, res, next) => {
    return sequelize.query(`
    SELECT following_id followingId, !ISNULL(own_follow) isFollowed, avatar, name, introduction
FROM Followships f1 
LEFT JOIN (SELECT following_id own_follow, created_at FROM Followships WHERE follower_id = :ownId) follow 
ON following_id = own_follow 
JOIN Users u ON f1.following_id = u.id
WHERE f1.follower_id = :userId
ORDER BY follow.created_at DESC 
    `,
    {
      replacements: { userId: req.params.userId, ownId: helpers.getUser(req).id },
      type: sequelize.QueryTypes.SELECT
    })
      .then(followings => res.json(followings))
      .catch(error => next(error))
  },

  signUp: (req, res, next) => {
    const { name, email, password, account } = req.body

    if (password !== req.body.checkPassword) throw createError(400, 'Passwords do not match!')
    if (name.length > 50) throw createError(400, 'The length of name exceeds 50 characters.')

    return Promise.all([
      User.findOne({ where: { account } }),
      User.findOne({ where: { email } })
    ])
      .then(([account, email]) => {
        if (account) throw createError(409, 'This account is already registered')
        if (email) throw createError(409, 'This email is already registered')
        return bcrypt.hash(password, 10)
      })
      .then(hash => {
        return User.create({
          name,
          account,
          email,
          password: hash,
          role: 'user'
        })
      })
      .then(newUser => {
        delete newUser.dataValues.password
        return res.json(newUser)
      })
      .catch(error => next(error))
  },

  signIn: (req, res, next) => {
    try {
      const { password, ...userData } = helpers.getUser(req).toJSON()
      if (userData.role !== 'user') throw createError(403, 'Access to the requested resource is forbidden')
      const token = jwt.sign(userData, process.env.JWT_SECRET, {
        expiresIn: '30d'
      })
      res.json({
        token,
        user: userData
      })
    } catch (error) {
      next(error)
    }
  },

  putUser: (req, res, next) => {
    if (helpers.getUser(req).id.toString() !== req.params.userId) throw createError(403, 'Forbidden Error')
    const { name, introduction } = req.body
    const { files } = req
    if (name?.length > 50 || introduction?.length > 160) throw createError(400, 'Character Length Exceeds!')
    return User.findByPk(req.params.userId)
      .then(user => {
        let avatar = user.avatar
        let coverUrl = user.coverUrl
        if (files) {
          avatar = files.avatar ? files.avatar[0].path : user.avatar
          coverUrl = files.coverUrl ? files.coverUrl[0].path : user.coverUrl
        }
        return user.update({
          name,
          introduction,
          avatar,
          coverUrl
        })
      })
      .then(updatedUser => {
        const { password, ...userData } = updatedUser.dataValues
        return res.json(userData)
      })
      .catch(error => next(error))
  },

  patchUser: async (req, res, next) => {
    try {
      const { account, name, email, password, checkPassword } = req.body
      const checkDuplicate = await sequelize.query('SELECT (SELECT COUNT(1) FROM Users WHERE id <> :userId AND account = :account) AS accountCheck, (SELECT COUNT(1) FROM Users WHERE id <> :userId AND email = :email) AS emailCheck',
        {
          replacements: { userId: req.params.userId, account, email },
          type: sequelize.QueryTypes.SELECT
        })
      if (password !== checkPassword) throw next(createError(403, 'Password not match!'))
      if (checkDuplicate[0].accountCheck) throw next(createError(409, 'Account already exists!'))
      if (checkDuplicate[0].emailCheck) throw next(createError(409, 'Email already exists!'))
      if (helpers.getUser(req).id.toString() !== req.params.userId) throw next(createError(403, 'Forbidden Error'))
      const hashPassword = await bcrypt.hash(password, 10)
      return await sequelize.query('UPDATE Users SET name=:name, account=:account, email=:email, password=:password WHERE id=:userId',
        {
          replacements: {
            userId: req.params.userId,
            account,
            name,
            email,
            password: hashPassword
          },
          type: sequelize.QueryTypes.UPDATE
        })
      // Results will be an empty array and metadata will contain the number of affected rows.
        .then(([results, metadata]) => {
          const { password, checkPassword, ...others } = req.body
          res.json(others)
        })
        .catch(error => next(error))
    } catch (err) { next(err) }
  }
}

module.exports = userController
