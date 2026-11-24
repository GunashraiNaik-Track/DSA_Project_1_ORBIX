import { useState, type FormEvent } from 'react';
import { CornerDownRight, Heart, MessageSquare, Trash2, ImageOff } from 'lucide-react';
import type { CommentNode, PostItem } from '../types';
import { Avatar } from './Avatar';

interface PostCardProps {
  post: PostItem;
  currentUsername: string;
  onNavigateProfile: (username: string) => void;
  onToggleLike: (postId: string) => Promise<void>;
  onAddComment: (postId: string, content: string, parentId?: string | null) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
}

export function formatRelativeTime(unixSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function CommentBranch({
  node,
  depth,
  onNavigateProfile,
  onReply,
}: {
  node: CommentNode;
  depth: number;
  onNavigateProfile: (username: string) => void;
  onReply: (parentId: string, text: string) => Promise<void>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(node.id, replyText.trim());
      setReplyText('');
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={depth > 0 ? 'ml-6 pl-4 border-l border-[#2B2B2B]/15 mt-3' : 'pt-3'}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => onNavigateProfile(node.author)}
          className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006E53] rounded-lg"
        >
          <Avatar name={node.author_name} src={node.author_avatar} size="xs" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            <button
              type="button"
              onClick={() => onNavigateProfile(node.author)}
              className="font-semibold text-[#2B2B2B] hover:text-[#006E53] transition-colors"
            >
              {node.author_name}
            </button>
            <span className="text-[#2B2B2B]/55">·</span>
            <span className="text-[#2B2B2B]/75 font-mono text-[11px] tabular-nums">
              {formatRelativeTime(node.created_at)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#2B2B2B] leading-relaxed">{node.content}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReplyOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2B2B2B]/80 hover:text-[#006E53] transition-colors py-0.5"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>Reply</span>
            </button>
          </div>

          {replyOpen && (
            <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${node.author_name}...`}
                className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || submitting}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-40 rounded-lg transition-opacity whitespace-nowrap shrink-0"
              >
                {submitting ? 'Sending...' : 'Reply'}
              </button>
            </form>
          )}

          {node.replies.length > 0 && (
            <div>
              {node.replies.map((child) => (
                <CommentBranch
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onNavigateProfile={onNavigateProfile}
                  onReply={onReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PostCard({
  post,
  currentUsername,
  onNavigateProfile,
  onToggleLike,
  onAddComment,
  onDeletePost,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(post.comments.length > 0 && post.comments.length <= 2);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwn = post.author === currentUsername;

  const handleCreateComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await onAddComment(post.id, commentText.trim(), null);
      setCommentText('');
      setCommentsOpen(true);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleReply = async (parentId: string, text: string) => {
    await onAddComment(post.id, text, parentId);
    setCommentsOpen(true);
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDeletePost(post.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 transition-colors">
      {/* Author Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onNavigateProfile(post.author)}
            className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006E53] rounded-lg"
          >
            <Avatar name={post.author_name} src={post.author_avatar} size="md" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                onClick={() => onNavigateProfile(post.author)}
                className="font-semibold text-[#2B2B2B] hover:text-[#006E53] transition-colors text-[15px]"
              >
                {post.author_name}
              </button>
              <span className="text-xs font-mono text-[#2B2B2B]/75">@{post.author}</span>
              {post.author_role === 'faculty' && (
                <span className="text-xs font-bold text-[#006E53]">Faculty</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#2B2B2B]/80">
              <span>{post.author_programme}</span>
              {post.author_year && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{post.author_year}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatRelativeTime(post.created_at)}</span>
            </div>
          </div>
        </div>

        {isOwn && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete post"
            title="Delete post (can be undone)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/15 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#EC6E3C]" />
            <span>{deleting ? 'Removing...' : 'Delete'}</span>
          </button>
        )}
      </div>

      {/* Post Title & Prose */}
      <div className="mt-4">
        {post.title && (
          <h3 className="font-display text-lg font-semibold text-[#2B2B2B] leading-snug text-balance">
            {post.title}
          </h3>
        )}
        <p className="mt-2 text-[15px] text-[#2B2B2B] leading-relaxed whitespace-pre-line">
          {post.content}
        </p>
      </div>

      {/* Zero-Pill Unboxed Tags */}
      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-[#006E53]">
          {post.tags.map((tag, idx) => (
            <span key={tag} className="inline-flex items-center gap-2">
              {idx > 0 && <span aria-hidden="true" className="text-[#2B2B2B]/40">/</span>}
              <span>#{tag}</span>
            </span>
          ))}
        </div>
      )}

      {/* Optional Project Image with Resilient Fallback */}
      {post.image_url && (
        <div className="mt-4 overflow-hidden rounded-lg border border-[#2B2B2B]/15 bg-white">
          {!imgFailed ? (
            <img
              src={post.image_url}
              alt={post.title || `${post.author_name}'s project`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full max-h-[380px] object-cover block"
            />
          ) : (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-[#2B2B2B] bg-white">
              <ImageOff className="w-5 h-5 text-[#EC6E3C]" />
              <span className="text-xs font-medium">{post.title || 'Project media preview'}</span>
            </div>
          )}
        </div>
      )}

      {/* Action Bar */}
      <div className="mt-4 pt-3 border-t border-[#2B2B2B]/15 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleLike(post.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              post.liked_by_me
                ? 'bg-[#EC6E3C]/15 text-[#2B2B2B] border border-[#EC6E3C]'
                : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12 border border-transparent'
            }`}
          >
            <Heart className={`w-4 h-4 ${post.liked_by_me ? 'fill-[#EC6E3C] text-[#EC6E3C]' : ''}`} />
            <span className="font-mono tabular-nums">{post.like_count}</span>
            <span>{post.like_count === 1 ? 'Like' : 'Likes'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCommentsOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2B2B2B] hover:bg-[#EC6E3C]/12 transition-colors whitespace-nowrap shrink-0"
          >
            <MessageSquare className="w-4 h-4 text-[#006E53]" />
            <span className="font-mono tabular-nums">{post.comment_count}</span>
            <span>{post.comment_count === 1 ? 'Comment' : 'Comments'}</span>
          </button>
        </div>

        {post.trend_score !== null && post.trend_score !== undefined && (
          <span className="text-xs font-mono tabular-nums text-[#2B2B2B]/75">
            Trending score {post.trend_score.toFixed(2)}
          </span>
        )}
      </div>

      {/* Comments Tree & Input */}
      {commentsOpen && (
        <div className="mt-3 pt-3 border-t border-[#2B2B2B]/15">
          <form onSubmit={handleCreateComment} className="flex items-center gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add technical feedback or ask a question..."
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
            />
            <button
              type="submit"
              disabled={!commentText.trim() || submittingComment}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-40 rounded-lg transition-opacity whitespace-nowrap shrink-0"
            >
              {submittingComment ? 'Posting...' : 'Comment'}
            </button>
          </form>

          {post.comments.length > 0 ? (
            <div className="mt-2 divide-y divide-[#2B2B2B]/15">
              {post.comments.map((cmt) => (
                <CommentBranch
                  key={cmt.id}
                  node={cmt}
                  depth={0}
                  onNavigateProfile={onNavigateProfile}
                  onReply={handleReply}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[#2B2B2B]/75">
              No comments yet. Start the discussion above.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
