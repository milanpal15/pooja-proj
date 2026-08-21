/**
 * Deity lore for the Knowledge screen.
 *
 * Devotional reference content, so accuracy matters more than brevity: the
 * vahana, consort, sacred day and source texts are the things a devotee would
 * actually check. Kept as data rather than prose baked into the screen so it
 * can move to `/api/content` alongside the deity records later.
 *
 * Every entry carries Hindi as well as English. The app is bilingual by
 * default and this is exactly the material people read in Hindi.
 */

export type Fact = { k: string; kHi: string; v: string; vHi: string };

export type Lore = {
  id: string;
  epithet: string;
  epithetHi: string;
  about: string;
  aboutHi: string;
  facts: Fact[];
  /** Source scriptures. */
  texts: string[];
  textsHi: string[];
  festivals: string[];
  festivalsHi: string[];
};

const day = (v: string, vHi: string): Fact => ({ k: 'Sacred day', kHi: 'शुभ दिन', v, vHi });
const vahana = (v: string, vHi: string): Fact => ({ k: 'Vahana', kHi: 'वाहन', v, vHi });
const consort = (v: string, vHi: string): Fact => ({ k: 'Consort', kHi: 'संगिनी', v, vHi });
const abode = (v: string, vHi: string): Fact => ({ k: 'Abode', kHi: 'धाम', v, vHi });

export const LORE: Record<string, Lore> = {
  shiva: {
    id: 'shiva',
    epithet: 'Mahadeva — the Great God',
    epithetHi: 'महादेव',
    about:
      'One of the Trimurti, Shiva is the destroyer and transformer — the force that dissolves so that creation may begin again. He is worshipped most often as the lingam, and is the ascetic who holds the Ganga in his matted hair and the crescent moon at his brow.',
    aboutHi:
      'त्रिमूर्ति में शिव संहारक और परिवर्तनकारी हैं — वह शक्ति जो विलय करती है ताकि सृष्टि पुनः आरम्भ हो सके। उनकी पूजा प्रायः शिवलिंग के रूप में होती है। जटाओं में गंगा और मस्तक पर चंद्रमा धारण करने वाले वे महायोगी हैं।',
    facts: [
      abode('Mount Kailash', 'कैलाश पर्वत'),
      vahana('Nandi, the bull', 'नंदी'),
      consort('Parvati', 'पार्वती'),
      day('Monday', 'सोमवार'),
    ],
    texts: ['Shiva Purana', 'Sri Rudram', 'Shiva Tandava Stotram'],
    textsHi: ['शिव पुराण', 'श्री रुद्रम्', 'शिव ताण्डव स्तोत्र'],
    festivals: ['Mahashivratri', 'Shravan Somwar', 'Pradosh Vrat'],
    festivalsHi: ['महाशिवरात्रि', 'सावन सोमवार', 'प्रदोष व्रत'],
  },

  vishnu: {
    id: 'vishnu',
    epithet: 'Narayana — the Preserver',
    epithetHi: 'नारायण',
    about:
      'The preserver of the Trimurti, Vishnu sustains dharma and descends as an avatar whenever it falters — most famously as Rama and Krishna. He reclines on the serpent Shesha upon the cosmic ocean.',
    aboutHi:
      'त्रिमूर्ति में विष्णु पालनकर्ता हैं। जब-जब धर्म की हानि होती है, वे अवतार लेकर प्रकट होते हैं — राम और कृष्ण उनके सर्वाधिक प्रसिद्ध अवतार हैं। वे क्षीरसागर में शेषनाग पर शयन करते हैं।',
    facts: [
      abode('Vaikuntha', 'वैकुण्ठ'),
      vahana('Garuda, the eagle', 'गरुड़'),
      consort('Lakshmi', 'लक्ष्मी'),
      day('Thursday', 'गुरुवार'),
    ],
    texts: ['Vishnu Sahasranama', 'Bhagavata Purana', 'Vishnu Purana'],
    textsHi: ['विष्णु सहस्रनाम', 'भागवत पुराण', 'विष्णु पुराण'],
    festivals: ['Ekadashi', 'Vaikuntha Ekadashi', 'Anant Chaturdashi'],
    festivalsHi: ['एकादशी', 'वैकुण्ठ एकादशी', 'अनंत चतुर्दशी'],
  },

  ganesh: {
    id: 'ganesh',
    epithet: 'Vighnaharta — remover of obstacles',
    epithetHi: 'विघ्नहर्ता',
    about:
      'The elephant-headed son of Shiva and Parvati, Ganesha is invoked before every undertaking and every other deity. He is the patron of letters and learning, and is said to have written the Mahabharata as Vyasa dictated it.',
    aboutHi:
      'शिव और पार्वती के गजमुख पुत्र गणेश का आवाहन हर शुभ कार्य के आरम्भ में, सभी देवों से पहले किया जाता है। वे बुद्धि और लेखन के अधिपति हैं — व्यास जी के कहने पर महाभारत उन्होंने ही लिखी थी।',
    facts: [
      { k: 'Parents', kHi: 'माता-पिता', v: 'Shiva and Parvati', vHi: 'शिव और पार्वती' },
      vahana('Mushak, the mouse', 'मूषक'),
      { k: 'Offering', kHi: 'प्रिय भोग', v: 'Modak', vHi: 'मोदक' },
      day('Wednesday & Chaturthi', 'बुधवार व चतुर्थी'),
    ],
    texts: ['Ganesha Purana', 'Ganapati Atharvashirsha', 'Sankatnashan Ganesh Stotra'],
    textsHi: ['गणेश पुराण', 'गणपति अथर्वशीर्ष', 'संकटनाशन गणेश स्तोत्र'],
    festivals: ['Ganesh Chaturthi', 'Angarki Chaturthi'],
    festivalsHi: ['गणेश चतुर्थी', 'अंगारकी चतुर्थी'],
  },

  hanuman: {
    id: 'hanuman',
    epithet: 'Sankatmochan — dispeller of troubles',
    epithetHi: 'संकटमोचन',
    about:
      'The son of Vayu and the foremost devotee of Rama, Hanuman is the emblem of strength joined to humility. He leapt the ocean to Lanka to find Sita, and is held to be chiranjivi — living still, wherever the Ramayana is recited.',
    aboutHi:
      'पवनपुत्र हनुमान श्रीराम के परम भक्त हैं और बल के साथ विनम्रता के प्रतीक हैं। सीता माता की खोज में उन्होंने समुद्र लांघा था। वे चिरंजीवी माने जाते हैं — जहाँ भी रामकथा होती है, वहाँ उपस्थित रहते हैं।',
    facts: [
      { k: 'Father', kHi: 'पिता', v: 'Vayu, the wind', vHi: 'पवन देव' },
      { k: 'Devoted to', kHi: 'आराध्य', v: 'Shri Rama', vHi: 'श्री राम' },
      { k: 'Offering', kHi: 'प्रिय भोग', v: 'Boondi laddu, sindoor', vHi: 'बूंदी लड्डू, सिंदूर' },
      day('Tuesday & Saturday', 'मंगलवार व शनिवार'),
    ],
    texts: ['Hanuman Chalisa', 'Sundarkand', 'Bajrang Baan'],
    textsHi: ['हनुमान चालीसा', 'सुंदरकाण्ड', 'बजरंग बाण'],
    festivals: ['Hanuman Jayanti'],
    festivalsHi: ['हनुमान जयंती'],
  },

  durga: {
    id: 'durga',
    epithet: 'Mahishasuramardini — slayer of Mahishasura',
    epithetHi: 'महिषासुरमर्दिनी',
    about:
      'Durga is the warrior form of the Devi, born of the combined light of all the gods to defeat the buffalo demon no man or god could kill. She carries a weapon from each deity in her many hands, and rides a lion into battle.',
    aboutHi:
      'दुर्गा देवी का योद्धा स्वरूप हैं। समस्त देवताओं के तेज से उनका प्राकट्य हुआ, ताकि उस महिषासुर का वध हो सके जिसे कोई देव या मनुष्य नहीं मार सकता था। उनके हाथों में हर देवता का अस्त्र है और वाहन सिंह है।',
    facts: [
      vahana('Lion', 'सिंह'),
      consort('Shiva', 'शिव'),
      { k: 'Forms', kHi: 'स्वरूप', v: 'Navadurga — nine forms', vHi: 'नवदुर्गा — नौ स्वरूप' },
      day('Friday & Ashtami', 'शुक्रवार व अष्टमी'),
    ],
    texts: ['Durga Saptashati', 'Devi Mahatmya', 'Aigiri Nandini'],
    textsHi: ['दुर्गा सप्तशती', 'देवी माहात्म्य', 'अइगिरि नंदिनी'],
    festivals: ['Navratri', 'Durga Puja', 'Vijayadashami'],
    festivalsHi: ['नवरात्रि', 'दुर्गा पूजा', 'विजयादशमी'],
  },

  lakshmi: {
    id: 'lakshmi',
    epithet: 'Shri — goddess of fortune',
    epithetHi: 'श्री',
    about:
      'Lakshmi is the goddess of wealth, fortune and abundance — not gold alone, but the prosperity of a well-kept home and an honest livelihood. She arose from the churning of the ocean and chose Vishnu as her consort.',
    aboutHi:
      'लक्ष्मी धन, वैभव और समृद्धि की देवी हैं — केवल स्वर्ण की नहीं, बल्कि सुव्यवस्थित गृह और सदाचारी जीविका की भी। समुद्र मंथन से प्रकट होकर उन्होंने विष्णु को वरण किया।',
    facts: [
      vahana('Owl', 'उल्लू'),
      consort('Vishnu', 'विष्णु'),
      { k: 'Symbol', kHi: 'प्रतीक', v: 'Lotus and golden pot', vHi: 'कमल और कलश' },
      day('Friday', 'शुक्रवार'),
    ],
    texts: ['Sri Suktam', 'Kanakadhara Stotram', 'Lakshmi Ashtakam'],
    textsHi: ['श्री सूक्तम्', 'कनकधारा स्तोत्र', 'लक्ष्मी अष्टकम्'],
    festivals: ['Diwali', 'Sharad Purnima', 'Varalakshmi Vrat'],
    festivalsHi: ['दीपावली', 'शरद पूर्णिमा', 'वरलक्ष्मी व्रत'],
  },

  krishna: {
    id: 'krishna',
    epithet: 'Govinda — the eighth avatar',
    epithetHi: 'गोविंद',
    about:
      'The eighth avatar of Vishnu, Krishna is at once the child of Gokul who stole butter, the flute-player of Vrindavan, and the charioteer who spoke the Bhagavad Gita to Arjuna on the field at Kurukshetra.',
    aboutHi:
      'विष्णु के आठवें अवतार कृष्ण एक साथ गोकुल के माखनचोर बालक, वृंदावन के बंसीधर, और कुरुक्षेत्र में अर्जुन को गीता का उपदेश देने वाले सारथी हैं।',
    facts: [
      abode('Vrindavan, Dwarka', 'वृंदावन, द्वारका'),
      consort('Radha, Rukmini', 'राधा, रुक्मिणी'),
      { k: 'Offering', kHi: 'प्रिय भोग', v: 'Makhan mishri', vHi: 'माखन मिश्री' },
      day('Wednesday & Ashtami', 'बुधवार व अष्टमी'),
    ],
    texts: ['Bhagavad Gita', 'Bhagavata Purana', 'Madhurashtakam'],
    textsHi: ['भगवद्गीता', 'भागवत पुराण', 'मधुराष्टकम्'],
    festivals: ['Janmashtami', 'Holi', 'Govardhan Puja'],
    festivalsHi: ['जन्माष्टमी', 'होली', 'गोवर्धन पूजा'],
  },

  shani: {
    id: 'shani',
    epithet: 'Shanaishchara — the slow-mover',
    epithetHi: 'शनैश्चर',
    about:
      'Son of Surya and lord of the planet Saturn, Shani is the strict accountant of karma. He is feared as a giver of hardship, but the hardship is understood as consequence rather than cruelty — he rewards patience, labour and honesty exactly as he punishes their absence.',
    aboutHi:
      'सूर्यपुत्र और शनि ग्रह के अधिपति शनिदेव कर्मों के कठोर न्यायाधीश हैं। कष्टदाता माने जाते हैं, किन्तु वह कष्ट क्रूरता नहीं, कर्म का फल है — धैर्य, परिश्रम और सत्य का वे उतना ही फल देते हैं जितना उनके अभाव का दंड।',
    facts: [
      { k: 'Father', kHi: 'पिता', v: 'Surya, the sun', vHi: 'सूर्य देव' },
      vahana('Crow', 'कौआ'),
      { k: 'Offering', kHi: 'प्रिय अर्पण', v: 'Sesame oil, black cloth', vHi: 'तिल का तेल, काला वस्त्र' },
      day('Saturday', 'शनिवार'),
    ],
    texts: ['Shani Chalisa', 'Dasharatha Shani Stotra'],
    textsHi: ['शनि चालीसा', 'दशरथकृत शनि स्तोत्र'],
    festivals: ['Shani Amavasya', 'Shani Jayanti'],
    festivalsHi: ['शनि अमावस्या', 'शनि जयंती'],
  },
};

/** Deities that have lore written, in display order. */
export const KNOWLEDGE_IDS = [
  'shiva',
  'vishnu',
  'ganesh',
  'hanuman',
  'durga',
  'lakshmi',
  'krishna',
  'shani',
] as const;
