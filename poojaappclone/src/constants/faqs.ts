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

export const FAQS: FAQItem[] = [
  {
    id: 'faq_booking_1',
    category: 'booking',
    categoryTitleEn: 'Pooja & Seva Booking',
    categoryTitleHi: 'पूजा और सेवा बुकिंग',
    questionEn: 'How does online Pooja booking work?',
    questionHi: 'ऑनलाइन पूजा बुकिंग कैसे काम करती है?',
    answerEn:
      'Certified temple priests perform the sacred ritual at the physical temple on your selected date. Your name and gotra are recited in the holy sankalp. Sacred prasad is packed hygienically and dispatched to your address.',
    answerHi:
      'प्रमाणित मंदिर के पुजारी आपकी चुनी हुई तिथि पर भौतिक मंदिर में पवित्र अनुष्ठान करते हैं। पवित्र संकल्प में आपका नाम और गोत्र पढ़ा जाता है। प्रसाद को स्वच्छ रूप से पैक करके आपके पते पर भेजा जाता है।',
  },
  {
    id: 'faq_booking_2',
    category: 'booking',
    categoryTitleEn: 'Pooja & Seva Booking',
    categoryTitleHi: 'पूजा और सेवा बुकिंग',
    questionEn: 'Can I book a pooja on behalf of family members?',
    questionHi: 'क्या मैं परिवार के सदस्यों की ओर से पूजा बुक कर सकता हूँ?',
    answerEn:
      'Yes! During the booking process, you can enter the devotee’s full name and gotra so the priest recites their specific sankalp during the rite.',
    answerHi:
      'हाँ! बुकिंग के दौरान आप भक्त का पूरा नाम और गोत्र दर्ज कर सकते हैं ताकि पुजारी अनुष्ठान के दौरान उनका विशेष संकल्प बोल सकें।',
  },
  {
    id: 'faq_booking_3',
    category: 'booking',
    categoryTitleEn: 'Pooja & Seva Booking',
    categoryTitleHi: 'पूजा और सेवा बुकिंग',
    questionEn: 'How far in advance can I schedule a pooja?',
    questionHi: 'मैं कितने दिन पहले पूजा का समय निर्धारित कर सकता हूँ?',
    answerEn:
      'You can schedule a seva up to 7 days in advance. Dates are aligned with daily temple schedules and auspicious tithis.',
    answerHi:
      'आप 7 दिन पहले तक सेवा का समय निर्धारित कर सकते हैं। तिथियां दैनिक मंदिर कार्यक्रम और शुभ मुहूर्त के अनुसार होती हैं।',
  },
  {
    id: 'faq_prasad_1',
    category: 'prasad',
    categoryTitleEn: 'Prasad & Delivery',
    categoryTitleHi: 'प्रसाद और डिलीवरी',
    questionEn: 'What is included in the consecrated Prasad box?',
    questionHi: 'पवित्र प्रसाद बॉक्स में क्या शामिल होता है?',
    answerEn:
      'Each prasad package contains holy vibhuti/chandan, sacred thread (Raksha Sutra), energized dry fruits/sweets, and a sanctified temple blessing card.',
    answerHi:
      'प्रत्येक प्रसाद पैकेज में पवित्र भस्म/चंदन, रक्षा सूत्र, अभिमंत्रित सूखे मेवे/मिठाई और एक पवित्र मंदिर आशीर्वाद कार्ड शामिल होता है।',
  },
  {
    id: 'faq_prasad_2',
    category: 'prasad',
    categoryTitleEn: 'Prasad & Delivery',
    categoryTitleHi: 'प्रसाद और डिलीवरी',
    questionEn: 'How long does prasad delivery take?',
    questionHi: 'प्रसाद डिलीवरी में कितना समय लगता है?',
    answerEn:
      'Prasad is dispatched via express courier within 24 hours of pooja completion, reaching most domestic destinations across India within 3–5 business days.',
    answerHi:
      'पूजा संपन्न होने के 24 घंटे के भीतर प्रसाद एक्सप्रेस कूरियर से भेजा जाता है, जो भारत भर में 3–5 कार्यदिवसों में पहुँच जाता है।',
  },
  {
    id: 'faq_chadhava_1',
    category: 'chadhava',
    categoryTitleEn: 'E-Chadhava & Offerings',
    categoryTitleHi: 'ई-चढ़ावा और अर्पण',
    questionEn: 'What is E-Chadhava and how is it offered?',
    questionHi: 'ई-चढ़ावा क्या है और इसे कैसे अर्पित किया जाता है?',
    answerEn:
      'E-Chadhava enables devotees to offer flowers (Pushpam), bhog/food (Prasad), and deity attire (Vastram) digitally. Offerings are arranged directly at the temple sanctum on your behalf.',
    answerHi:
      'ई-चढ़ावा भक्तों को फूल (पुष्पम), भोग (प्रसाद) और वस्त्र डिजिटल रूप से अर्पित करने की सुविधा देता है। ये अर्पण मंदिर के गर्भगृह में आपकी ओर से व्यवस्थित किए जाते हैं।',
  },
  {
    id: 'faq_virtual_1',
    category: 'virtual',
    categoryTitleEn: 'Virtual Pooja & Aarti',
    categoryTitleHi: 'वर्चुअल पूजा और आरती',
    questionEn: 'How do I perform the interactive Virtual Aarti?',
    questionHi: 'मैं इंटरैक्टिव वर्चुअल आरती कैसे करूँ?',
    answerEn:
      'Go to the Pooja tab, hold and rotate the holy aarti thali in a clockwise circular motion around the deity. Completing 5 parikramas earns divine ॐ coins and sacred blessings.',
    answerHi:
      'पूजा टैब पर जाएँ, आरती की थाली को पकड़कर भगवान के चारों ओर घड़ी की दिशा में घुमाएँ। 5 परिक्रमाएँ पूरी करने पर दिव्य ॐ सिक्के और आशीर्वाद प्राप्त होते हैं।',
  },
  {
    id: 'faq_virtual_2',
    category: 'virtual',
    categoryTitleEn: 'Virtual Pooja & Aarti',
    categoryTitleHi: 'वर्चुअल पूजा और आरती',
    questionEn: 'How do I set up daily Aarti reminders?',
    questionHi: 'दैनिक आरती रिमाइंडर कैसे सेट करें?',
    answerEn:
      'Tap the Bell icon on the Home screen or visit Daily Reminders under Profile to schedule automated chime alerts for Mangala, Shringar, Sandhya, and Shayan aartis.',
    answerHi:
      'होम स्क्रीन पर घंटी आइकन टैप करें या मंगला, श्रृंगार, संध्या और शयन आरती के लिए स्वचालित रिमाइंडर शेड्यूल करने के लिए प्रोफ़ाइल में दैनिक रिमाइंडर पर जाएँ।',
  },
  {
    id: 'faq_account_1',
    category: 'account',
    categoryTitleEn: 'Account & Support',
    categoryTitleHi: 'खाता और सहायता',
    questionEn: 'How can I reach customer support for assistance?',
    questionHi: 'सहायता के लिए मैं ग्राहक सेवा से कैसे संपर्क कर सकता हूँ?',
    answerEn:
      'Use the Call or Email buttons at the top of this screen — they open whichever channels this temple has published.',
    answerHi:
      'इस स्क्रीन के ऊपर दिए कॉल या ईमेल बटन का उपयोग करें — वे इस मंदिर द्वारा प्रकाशित माध्यम खोलते हैं।',
  },
];
