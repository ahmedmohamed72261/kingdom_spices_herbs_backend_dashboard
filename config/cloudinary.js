const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage configuration for image-only uploads
const createImageStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `herbs-dashboard/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [
        { width: 1000, height: 1000, crop: 'limit' },
        { quality: 'auto:best' },
        { fetch_format: 'auto' }
      ]
    }
  });
};

// Storage configuration for certificates (images and PDFs)
const createCertificateStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: (req, file) => {
      const isImage = file.mimetype && file.mimetype.startsWith('image/');
      const common = {
        folder: `herbs-dashboard/${folder}`,
        resource_type: 'auto'
      };
      if (isImage) {
        return {
          ...common,
          allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
          transformation: [
            { width: 1000, height: 1000, crop: 'limit' },
            { quality: 'auto:best' },
            { fetch_format: 'auto' }
          ]
        };
      }
      // PDFs or other non-image docs
      return {
        ...common,
        allowed_formats: ['pdf']
      };
    }
  });
};

// Different storage configurations
const productStorage = createImageStorage('products');
const certificateStorage = createCertificateStorage('certificates');
const teamStorage = createImageStorage('team');

// Multer configurations
const uploadProduct = multer({ 
  storage: productStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const uploadCertificate = multer({ 
  storage: certificateStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image or PDF files are allowed'), false);
    }
  }
});

const uploadTeam = multer({ 
  storage: teamStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Helper function to delete asset from Cloudinary
const deleteAsset = async (publicId, resourceType = 'image') => {
  try {
    if (publicId) {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      return result;
    }
  } catch (error) {
    console.error('Error deleting asset from Cloudinary:', error);
    throw error;
  }
};

// Backwards compatible helpers
const deleteImage = async (publicId) => deleteAsset(publicId, 'image');
const deleteRaw = async (publicId) => deleteAsset(publicId, 'raw');

// Helper function to extract public ID from Cloudinary URL
const extractPublicId = (url) => {
  try {
    if (!url) return null;
    
    // Extract public ID from Cloudinary URL
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = filename.split('.')[0];
    
    // Include folder path if present
    const folderIndex = parts.indexOf('herbs-dashboard');
    if (folderIndex !== -1 && folderIndex < parts.length - 1) {
      const folderPath = parts.slice(folderIndex, -1).join('/');
      return `${folderPath}/${publicId}`;
    }
    
    return publicId;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

module.exports = {
  cloudinary,
  uploadProduct,
  uploadCertificate,
  uploadTeam,
  deleteImage,
  deleteRaw,
  deleteAsset,
  extractPublicId
};