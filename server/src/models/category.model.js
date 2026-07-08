/**
 * @file category.model.js
 * @description Mongoose schema for event categories.
 *
 * DESIGN DECISIONS:
 * -----------------
 * 1. SLUG FIELD
 *    A slug is a URL-friendly version of the name: "Rock Music" → "rock-music"
 *    Slugs are used in:
 *      - API filter params: GET /events?category=rock-music
 *      - Frontend URLs: /events/category/rock-music
 *    We auto-generate the slug from the name in the pre-save hook.
 *    This keeps slug and name always in sync without the client having to send both.
 *
 * 2. SOFT DELETION VIA isActive
 *    We don't hard-delete categories that have events attached to them.
 *    Instead we set isActive = false (soft delete).
 *    This preserves referential integrity — existing events still reference
 *    valid category IDs, they just won't appear in the active category list.
 */

import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      maxlength: [50, 'Category name cannot exceed 50 characters'],
    },
    // URL-safe version: "Rock Music" → "rock-music"
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
      default: null,
    },
    icon: {
      type: String, // Emoji or icon name, e.g. "🎵" or "music"
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
categorySchema.index({ slug: 1 });
categorySchema.index({ isActive: 1 });

// ─── Pre-Save Hook: Auto-generate slug ────────────────────────────────────────
categorySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')   // Remove special chars
      .replace(/\s+/g, '-')            // Spaces → hyphens
      .replace(/-+/g, '-');            // Collapse multiple hyphens
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);
export default Category;
