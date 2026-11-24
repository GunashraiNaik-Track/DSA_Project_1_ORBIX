import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api } from '../api';
import type { PostItem } from '../types';

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (post: PostItem) => void;
}

export function ComposeModal({ open, onClose, onCreated }: ComposeModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleImagePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await api.uploadImage(file);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);
      const res = await api.createPost({
        title: title.trim(),
        content: content.trim(),
        tags,
        image_url: imageUrl,
      });
      setTitle('');
      setContent('');
      setTagsText('');
      setImageUrl(null);
      onCreated(res.post);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish post');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#2B2B2B]/65 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Publish project or technical idea"
    >
      <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl w-full max-w-xl p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
          <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
            Publish Project or Technical Idea
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#2B2B2B] hover:bg-[#EC6E3C]/12 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 px-3 py-2 text-sm text-[#2B2B2B] bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
              Project / Note Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Custom LoRa Telemetry Node v2"
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
              Technical Write-up
            </label>
            <textarea
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe your architecture, benchmark results, hardware choices, or collaboration needs..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] resize-y text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="Robotics, Algorithms, PCB, Python"
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg cursor-pointer transition-colors">
                <ImagePlus className="w-4 h-4 text-[#006E53]" />
                <span>{uploading ? 'Uploading image...' : 'Attach Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="text-xs font-semibold text-[#EC6E3C] hover:underline"
                >
                  Remove image
                </button>
              )}
            </div>

            {imageUrl && (
              <div className="mt-3 overflow-hidden rounded-lg border border-[#2B2B2B]/15">
                <img
                  src={imageUrl}
                  alt="Upload preview"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-56 object-cover"
                />
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#2B2B2B]/15 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/15 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim() || submitting || uploading}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-40 rounded-lg transition-opacity"
            >
              {submitting ? 'Publishing...' : 'Publish Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
