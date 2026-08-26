import thailandProvinceSource from './thailandProvinces.json';

export const mapViewBox = {
  width: 760,
  height: 980,
};

const visitedProvinceStats = {
  10: { trips: 2, photos: 12, favorite: false },
  20: { trips: 1, photos: 8, favorite: false },
  23: { trips: 3, photos: 26, favorite: true },
  50: { trips: 1, photos: 7, favorite: false },
  71: { trips: 1, photos: 5, favorite: false },
  84: { trips: 1, photos: 10, favorite: false },
};

export const thailandProvincesGeojson = {
  ...thailandProvinceSource,
  features: thailandProvinceSource.features.map((feature) => {
    const code = feature.properties.pro_code;
    const stats = visitedProvinceStats[code] ?? { trips: 0, photos: 0, favorite: false };

    return {
      ...feature,
      properties: {
        ...feature.properties,
        code,
        name: feature.properties.pro_en,
        thaiName: feature.properties.pro_th,
        trips: stats.trips,
        photos: stats.photos,
        visited: stats.trips > 0,
        favorite: stats.favorite,
      },
    };
  }),
};

export const memoryPlaces = [
  {
    id: 'koh-chang',
    provinceCode: '23',
    name: 'Ko Chang',
    thaiName: 'เกาะช้าง',
    dateRange: '12-15 ต.ค. 2026',
    photoCount: 18,
    latitude: 12.1036,
    longitude: 102.3518,
    description: 'ลมทะเล ฝนช่วงเย็น และถนนเงียบ ๆ รอบเกาะช้าง',
    coverTone: 'sea',
    photos: [
      {
        id: 'klong-prao-evening',
        title: 'Klong Prao Beach',
        thaiTitle: 'หาดคลองพร้าว',
        takenAt: '13 ตุลาคม 2026',
        caption: 'ตอนเย็นฝนเพิ่งหยุด ฟ้ากลับมาสว่างแค่พอให้ทะเลเป็นสีเงิน',
        latitude: 12.0555,
        longitude: 102.2968,
        tone: 'sand',
      },
      {
        id: 'white-sand-road',
        title: 'White Sand Road',
        thaiTitle: 'ถนนหาดทรายขาว',
        takenAt: '14 ตุลาคม 2026',
        caption: 'แวะกาแฟข้างทางก่อนขับต่อ ฝั่งภูเขายังมีหมอกบาง ๆ',
        latitude: 12.1097,
        longitude: 102.2829,
        tone: 'forest',
      },
      {
        id: 'bang-bao-pier',
        title: 'Bang Bao Pier',
        thaiTitle: 'ท่าเรือบางเบ้า',
        takenAt: '15 ตุลาคม 2026',
        caption: 'ท้ายทริปที่ลมแรงพอดี เรือทั้งท่าไหวไปพร้อมกัน',
        latitude: 11.9716,
        longitude: 102.3319,
        tone: 'sunset',
      },
    ],
  },
];
