import React, { useState } from 'react';
import { Star, CheckCircle2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { createReview } from '../services/apiService';
import { getErrorMessage } from '../utils/formatters';
import type { Profile } from '../types';

const RATING_LABELS: Record<number, string> = {
  1: 'تجربة سيئة جداً',
  2: 'تجربة غير مرضية',
  3: 'تجربة مقبولة',
  4: 'تجربة جيدة',
  5: 'تجربة ممتازة'
};

const COMMENT_MAX_LENGTH = 300;

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  otherParty: Profile;
  onSubmitted: () => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, onClose, bookingId, otherParty, onSubmitted }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const reset = () => {
    setRating(0);
    setHoverRating(0);
    setComment('');
    setError('');
    setIsSuccess(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (rating < 1) {
      setError('يرجى اختيار عدد النجوم أولاً');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await createReview({ bookingId, revieweeId: otherParty.id, rating, comment: comment.trim() || undefined });
      setIsSuccess(true);
      onSubmitted();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'تعذر حفظ التقييم، حاول مرة أخرى'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedRating = hoverRating || rating;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`تقييم ${otherParty.full_name}`}>
      {isSuccess ? (
        <div className="text-center space-y-3 py-4">
          <CheckCircle2 className="w-10 h-10 text-primary-600 mx-auto" />
          <p className="text-sm font-black text-gray-950">تم إرسال تقييمك بنجاح</p>
          <Button fullWidth onClick={handleClose}>تم</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {otherParty.avatar_url ? (
                <img src={otherParty.avatar_url} alt={otherParty.full_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-black text-primary-700">{otherParty.full_name.charAt(0)}</span>
              )}
            </div>
            <div>
              <p className="text-sm font-black text-gray-950">{otherParty.full_name}</p>
              <p className="text-[11px] text-gray-500 font-semibold">كيف كانت تجربتك في هذه الرحلة؟</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex gap-1" role="radiogroup" aria-label="عدد النجوم">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star} نجوم`}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= displayedRating ? 'fill-primary-500 text-primary-500' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {displayedRating > 0 && (
              <p className="text-xs font-bold text-primary-700">{RATING_LABELS[displayedRating]}</p>
            )}
          </div>

          <div className="w-full text-right">
            <label htmlFor="review-comment" className="block text-xs font-bold text-gray-900 mb-1">
              تعليق (اختياري)
            </label>
            <textarea
              id="review-comment"
              className="input min-h-[80px] resize-none"
              maxLength={COMMENT_MAX_LENGTH}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="شارك تفاصيل تجربتك..."
            />
            <p className="mt-1 text-[10px] text-gray-400 font-semibold text-left">
              {comment.length}/{COMMENT_MAX_LENGTH}
            </p>
          </div>

          <Button fullWidth isLoading={isSubmitting} onClick={handleSubmit}>
            إرسال التقييم
          </Button>
        </div>
      )}
    </Modal>
  );
};
