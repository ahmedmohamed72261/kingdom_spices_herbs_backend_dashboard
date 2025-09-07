const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Message = require('../models/Message');
const { adminAuth, auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/messages
// @desc    Get all messages with filtering and pagination (Admin only)
// @access  Private (Admin)
router.get('/', [
  adminAuth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isIn(['general', 'support', 'sales', 'partnership', 'complaint', 'herbs', 'other']).withMessage('Invalid category'),
  query('priority').optional().isIn(['low', 'medium', 'high', 'CEO', 'Sales Manager', 'Herbs Priority']).withMessage('Invalid priority'),
  query('search').optional().isLength({ max: 100 }).withMessage('Search term too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { category, priority, search, isRead, replied } = req.query;

    // Build filter object
    let filter = {};
    
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (isRead !== undefined) filter.isRead = isRead === 'true';
    if (replied !== undefined) filter.replied = replied === 'true';
    if (search) filter.$text = { $search: search };

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('notes.addedBy', 'email');

    const total = await Message.countDocuments(filter);

    const stats = await Message.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
          unreplied: { $sum: { $cond: [{ $eq: ['$replied', false] }, 1, 0] } },
          highPriority: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      },
      stats: stats[0] || { total: 0, unread: 0, unreplied: 0, highPriority: 0 }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching messages' });
  }
});

// @route   GET /api/messages/:id
// @desc    Get single message (Admin only)
// @access  Private (Admin)
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id).populate('notes.addedBy', 'email');
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await message.save();
    }

    res.json({ success: true, data: message });
  } catch (error) {
    console.error('Get message error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    res.status(500).json({ success: false, message: 'Server error while fetching message' });
  }
});

// @route   POST /api/messages
// @desc    Create new message (Public - from contact form)
// @access  Public
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('subject').trim().isLength({ min: 1, max: 200 }).withMessage('Subject must be between 1 and 200 characters'),
  body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Message must be between 1 and 2000 characters'),
  body('phone').optional().trim().isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters'),
  body('category').optional().isIn(['general', 'support', 'sales', 'partnership', 'complaint', 'herbs', 'other']).withMessage('Invalid category')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { name, email, phone, subject, message, category } = req.body;
    const messageData = {
      name,
      email,
      subject,
      message,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    if (phone) messageData.phone = phone;
    if (category) messageData.category = category;

    const text = (subject + ' ' + message).toLowerCase();

    if (text.includes('ceo') || text.includes('urgent') || text.includes('important')) {
      messageData.priority = 'CEO';
    } else if (category === 'sales' || text.includes('sales manager')) {
      messageData.priority = 'Sales Manager';
    } else if (category === 'herbs' || text.includes('herb') || text.includes('natural')) {
      messageData.priority = 'Herbs Priority';
    } else if (category === 'complaint') {
      messageData.priority = 'high';
    } else {
      messageData.priority = 'medium';
    }

    const newMessage = new Message(messageData);
    await newMessage.save();

    res.status(201).json({
      success: true,
      message: 'Message sent successfully. We will get back to you soon!',
      data: {
        id: newMessage._id,
        name: newMessage.name,
        subject: newMessage.subject,
        priority: newMessage.priority,
        createdAt: newMessage.createdAt
      }
    });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ success: false, message: 'Server error while sending message' });
  }
});

// @route   PUT /api/messages/:id
// @desc    Update message status (Admin only)
// @access  Private (Admin)
router.put('/:id', [
  adminAuth,
  body('isRead').optional().isBoolean().withMessage('isRead must be a boolean'),
  body('replied').optional().isBoolean().withMessage('replied must be a boolean'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'CEO', 'Sales Manager', 'Herbs Priority']).withMessage('Invalid priority'),
  body('category').optional().isIn(['general', 'support', 'sales', 'partnership', 'complaint', 'herbs', 'other']).withMessage('Invalid category')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const { isRead, replied, priority, category } = req.body;

    if (isRead !== undefined) {
      message.isRead = isRead;
      if (isRead && !message.readAt) message.readAt = new Date();
    }
    if (replied !== undefined) {
      message.replied = replied;
      if (replied && !message.repliedAt) message.repliedAt = new Date();
    }
    if (priority) message.priority = priority;
    if (category) message.category = category;

    await message.save();
    res.json({ success: true, message: 'Message updated successfully', data: message });
  } catch (error) {
    console.error('Update message error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    res.status(500).json({ success: false, message: 'Server error while updating message' });
  }
});


module.exports = router;
