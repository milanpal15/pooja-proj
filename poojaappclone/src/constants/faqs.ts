export interface FAQItem {
  id: string;
  category: 'booking' | 'prasad' | 'chadhava' | 'virtual' | 'account';
  categoryTitleEn: string;
  categoryTitleHi: string;
  questionEn: string;
  questionHi: string;
  answerEn: string;
  answerHi: string;
}

