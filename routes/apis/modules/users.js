const express = require('express')
const upload = require('../../../middleware/multer')

const router = express.Router()

const userController = require('../../../controllers/user-controller')

router.get('/:userId/tweets', userController.getUserTweets)
router.get('/:userId/replied_tweets', userController.getUserReplies)
router.get('/:userId/likes', userController.getUserLikes)
router.get('/:userId/followers', userController.getUserFollowers)
router.get('/:userId/followings', userController.getUserFollowings)
router.get('/:userId', userController.getUser)
router.put('/:userId', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'coverUrl', maxCount: 1 }]), userController.putUser)
router.patch('/:userId', userController.patchUser)

module.exports = router
