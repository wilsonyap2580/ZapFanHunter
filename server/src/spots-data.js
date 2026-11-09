// Seed data: zap fan / economy rice / nasi campur spots around Klang Valley and Seremban.
// Carried over from the earlier ZapFan prototype (checked on Google Maps, 30 Oct 2026).
// Row: [name, area, address, lat, lng, rating, reviewCount, typeCodes, hours, googlePlaceId]
// typeCodes: E Economy Rice, C Chap Fan, N Nasi Campur, Z Zapfan
// hours: "HH:MM-HH:MM" default for every day, then "|d=HH:MM-HH:MM" overrides (d: 0=Sun..6=Sat), "|d=" means closed.

export const TYPE_NAMES = { E: 'Economy Rice', C: 'Chap Fan 杂饭', N: 'Nasi Campur', Z: 'Zapfan' };

export const SPOTS = [
  ['Nasi Campur Pagi Malam', 'Bangsar', 'Jalan Telawi 5', 3.1330748, 101.6707578, 4.5, 812, 'NE', '10:30-22:30', 'ChIJ1TF2SABJzDERmMHlQ1w3elI'],
  ['Pu Xian Wei Restaurant', 'Brickfields', 'Jalan Thambypillai', 3.1326769, 101.6884979, 3.7, 333, 'CE', '06:30-20:30|0=', 'ChIJrVBR6MFJzDERDr5cOLkU7k8'],
  ['Restoran 68 Mixed Rice', 'Pudu', 'Jalan Landak', 3.1377616, 101.7123818, 3.8, 1203, 'CE', '10:00-21:15', 'ChIJVc-cnyY2zDERuSf7ir7F1vo'],
  ['Dapor Sabariyya', 'Bangsar', 'Lorong Ara Kiri 3', 3.1276061, 101.6691895, 5.0, 6, 'NE', '08:30-14:30|6=', 'ChIJHTd0lX9JzDERfjZUU4l2drk'],
  ['Uncle Lee Mixed Rice 李杂饭专卖店', 'Bandar Mahkota Cheras', 'Jalan Temenggung 19/9', 3.0532647, 101.7864767, 3.6, 440, 'CZ', '10:30-20:00', 'ChIJrUkocIU1zDERIW80dds3A7E'],
  ['Restoran Chai Huat 2', 'Cheras', 'Jalan Manis 1, Taman Bukit Segar', 3.0901299, 101.7435359, 4.2, 134, 'EC', '07:00-15:00|0=', 'ChIJaQTeGLc1zDERacxp8D-0eqA'],
  ['Restoran 58G Mixed Rice 经济杂饭', 'Cheras', 'Jalan Dataran Cheras 3', 3.0353087, 101.7632894, 3.5, 827, 'CE', '10:00-21:15', 'ChIJPSOpfdI0zDERk00CzK5aFDc'],
  ['Restoran Mixed Rice', 'Cheras', 'Jalan 34/154, Taman Dahlia', 3.0574973, 101.747936, 3.5, 516, 'CE', '09:00-21:00', 'ChIJpY4AJeA1zDERMy5shBHOWM0'],
  ['PJ72 Mixed Rice 菜饭之家', 'Petaling Jaya', 'Jalan 17/29, Seksyen 17', 3.1285858, 101.635376, 2.4, 169, 'CE', '10:00-21:15', 'ChIJ5aT4YQBJzDER4OkCc4mdC3w'],
  ['Restaurant 134 Mixed Rice', 'Petaling Jaya', 'Jalan SS 24/13, Taman Megah', 3.1143737, 101.6129823, 3.3, 2438, 'CE', '10:00-21:15', 'ChIJtatmx6tOzDERQS3AJPGh1fw'],
  ['Kantan Mixed Rice 簡單什飯', 'Petaling Jaya', 'Jalan 21/19, Sea Park', 3.1090731, 101.6222557, 3.9, 181, 'CE', '10:00-20:00|0=', 'ChIJxXZzF_xLzDERTM_8JiMZEhk'],
  ['Zap Fan Factory', 'Sunway', 'Jalan PJS 11/7, Bandar Sunway', 3.0664712, 101.6023957, 4.0, 101, 'ZE', '10:00-20:00|0=', 'ChIJu_wSZgBNzDERJJbOf93x6_w'],
  ['Restoran 10 Mixed Rice 10什饭专卖店', 'Setapak', 'Jalan 14/27b, Desa Setapak', 3.2058795, 101.7331944, 3.5, 557, 'CE', '10:00-21:15', 'ChIJO3NKkD44zDERH7_gpFWvqEw'],
  ['Pak Uda Nasi Campur', 'Setapak', "D'Rejang, Taman Sri Rampai", 3.1920512, 101.7275452, 4.4, 51, 'NE', '06:00-18:00|1=', 'ChIJE6VbeSA5zDERx1KcVkDrmTs'],
  ['Orange Mix Rice Setapak 33', 'Setapak', 'Danau Kota', 3.1986963, 101.7141291, 3.6, 74, 'CE', '09:00-21:00', 'ChIJjxBCJpk5zDERYgPxSN-Mbi8'],
  ['Super Mixed Rice Subang 杂饭皇', 'Subang Jaya', 'Jalan USJ 1/19, Taman Subang Permai', 3.0576977, 101.6002787, 3.6, 244, 'CE', '06:00-23:00', 'ChIJD7kH5hhNzDER1uZyyB47Np8'],
  ['Restoran T23 Mixed Rice 快餐专卖店', 'Subang Jaya', 'Jalan USJ 10/1e, Taipan', 3.048722, 101.583851, 3.6, 548, 'CE', '10:00-21:15', 'ChIJAdoydRBNzDERoD-__RxNto8'],
  ['Mr. Rice Corner 经济杂饭', 'Subang Jaya', 'Jalan SS 15/4b, SS15', 3.0767427, 101.5892002, 4.1, 277, 'CE', '09:30-20:45|6=09:45-14:40', 'ChIJ1dVtZu1NzDERp72CtHNeB3I'],
  ['Orange SS 15 Mix Rice', 'Subang Jaya', 'Jalan SS 15/4b, SS15', 3.0772868, 101.5890259, 3.7, 390, 'CE', '09:00-21:00', 'ChIJQ53YnbhNzDERl3kp0Y3d1B4'],
  ['Restoran S11 Bandar Puteri 经济杂饭', 'Puchong', 'Jalan Puteri 5/1, Bandar Puteri', 3.013592, 101.6175192, 3.3, 116, 'CE', '09:00-21:00', 'ChIJPcClIVe1zTER6eGcJLzuNNo'],
  ['KL 52 Mixed Rice 经济杂饭', 'Puchong', 'Jalan TK 1/11e, Taman Kinrara', 3.0634774, 101.6473649, 4.2, 30, 'CE', '09:30-20:30', 'ChIJv2BJDuhLzDERDJcLVjmLjEg'],
  ['S One One Restaurant Setia Alam', 'Setia Alam', 'Jalan Setia Prima B U13/B', 3.0948227, 101.4459206, 3.3, 462, 'CE', '09:00-21:00', 'ChIJAQDAZO1TzDERvj2sjoD_ZYM'],
  ['新一家什饭专卖店 Xin Yi Jia', 'Klang', 'Taman Sentosa', 3.0099134, 101.4668924, 4.4, 89, 'CE', '07:30-18:30|6=07:30-15:30|0=', 'ChIJfSjelVutzTERfdlaxjAWoL0'],
  ['新一家杂饭专卖店 (Bandar Botanic)', 'Klang', 'Jalan Ramin 3, Bandar Botanik', 2.9883596, 101.4547058, 4.6, 14, 'CE', '07:30-19:00|6=07:30-16:30|0=', 'ChIJ2dQ1hDWtzTERUP9dzjpaurc'],
  ['Zap Fan Canteen', 'Klang', 'Jalan Kasuarina 8, Bandar Botanik', 2.9869159, 101.4517292, 4.4, 142, 'ZE', '08:30-21:00|0=16:30-21:30', 'ChIJQ-NPBqmtzTERyzK28HTyER4'],
  ['Family Rice Catering (Bukit Tinggi)', 'Klang', 'The Landmark, Bandar Bukit Tinggi 2', 2.9950189, 101.4428538, 4.2, 12, 'CE', '08:30-18:00', 'ChIJK0kDwGhTzDER-zQDaEAze7g'],
  ['Mr.B Mixed Rice B记杂饭', 'Kajang', 'Jalan SL 13, Bandar Sungai Long', 3.0395156, 101.7930402, 4.6, 63, 'CE', '10:30-20:00|0=', 'ChIJEZ8CDxQ1zDERbUqJkmyqOos'],
  ['Mixed Rice (Wong & Teh)', 'Kajang', 'Persiaran KWSP, Taman Universiti', 2.9415374, 101.7860356, 4.3, 16, 'CE', '10:00-15:00|6=|0=', 'ChIJZ-btVY3JzTER2yAU_bnR66E'],
  ['Restoran 1 Mixed Rice 什饭专卖店', 'Kajang', 'Jalan SL 1/3, Bandar Sungai Long', 3.0408595, 101.7936968, 3.3, 423, 'CE', '10:00-21:15', 'ChIJvcp_6qg0zDER7bKg6dzDTyg'],
  ['Restoran Nasi Campur Klasik', 'Pandan Indah', 'Persiaran MPAJ, Pandan Indah', 3.1275513, 101.7530148, 4.5, 104, 'NE', '07:30-16:00|0=', 'ChIJzwyFZ-M3zDER9Wzd4-9wXs0'],
  ['Restoran RD', 'Pandan Indah', 'Jalan Pandan Indah 1/23e', 3.1307562, 101.7523849, 4.1, 39, 'NE', '11:00-17:30', 'ChIJWQz7VfU2zDERhdYF_1nAxeY'],
  ['S11 Mixed Rice', 'Pandan Indah', 'Jalan Pandan Indah 4/4', 3.1299549, 101.7556274, 2.3, 70, 'CE', '09:30-21:30', 'ChIJO5g5RQA3zDERQe8atK75xqc'],
  ['Restoran 368 Mixed Rice', 'Seremban', 'Oakland Commerce Square', 2.7048984, 101.9193936, 4.1, 14, 'CE', '09:30-19:30|1=10:00-19:30|0=', 'ChIJ0yALaQDnzTERSn2-wnY9Rf0'],
  ['Qianyuge Mixed Rice 乾御阁', 'Seremban', 'Jalan Tunku Hassan', 2.7259545, 101.9380498, 3.2, 27, 'CE', '09:00-20:00|1=06:00-15:00|2=06:00-15:00|0=', 'ChIJqy5D10nhzTERWNgcSYinPRI'],
  ['Oakland Sheng Style Recipe', 'Seremban', 'Medan Perdagangan Oakland', 2.7044794, 101.9175666, 3.9, 553, 'CE', '09:00-20:30', 'ChIJY8Lu4ZPnzTERYE7yHPnvLRY'],
  ['Restoran Lesung Nilai', 'Nilai', 'Putra Indah, Bandar Baru Nilai', 2.8189783, 101.7871986, 4.4, 87, 'NE', '07:00-16:30|0=', 'ChIJc77gUwvHzTERy61RHDhuUxc'],
  ['Ho Jiak Mixed Rice 经济杂饭', 'Sri Petaling', 'Jalan Radin Anum', 3.0669473, 101.6920002, 3.4, 114, 'CE', '09:30-21:00', 'ChIJtzdfEgBLzDERGX-8l4oBLU4'],
  ['Hometown Mixed Rice 家乡杂饭', 'Sri Petaling', 'Jalan Perisa, Taman Bukit Indah', 3.0767228, 101.6798097, 3.2, 64, 'CE', '08:00-17:00|0=', 'ChIJeejiv15KzDERZSzi-Um-zuI'],
  ['Restoran OUG23 Mixed Rice', 'OUG', 'Jalan Mega Mendung, Taman United', 3.083518, 101.672755, 3.9, 1599, 'CE', '10:00-21:15', 'ChIJL6GCV0VKzDERpGbR32h-W88'],
  ['Super Mixed Rice & Seafood 杂饭皇', 'Imbi', 'Jalan Barat, off Jalan Imbi', 3.142774, 101.7154225, 4.5, 140, 'CE', '09:00-20:00', 'ChIJPfW6a4k3zDERM4HTMyhTBEo'],
  ['Restoran Mum Taste Mixed Rice', 'Kepong', 'Jalan Kampung Batu, Jalan Ipoh', 3.2039177, 101.6749925, 4.0, 31, 'CE', '10:30-21:00', 'ChIJw1Z2QgBHzDERGjl5a6i5LtE'],
  ['Restoran Sun Gee 胜记杂菜饭', 'Cheras', 'Jalan Bunga Tanjung 10A, Taman Muda', 3.1185052, 101.7624565, 3.7, 485, 'CE', '10:40-21:00', 'ChIJraVr3oQ2zDER65FgW-Y1O0s'],
];

// A few sample diner notes so the reviews section isn't empty on first run.
export const SAMPLE_REVIEWS = [
  ['Aisha', 5, 'Plenty of dishes, fried chicken goes fast. Go before 12.'],
  ['Kevin', 4, 'Fair prices and the curry vegetables are really good.'],
  ['Mei Ling', 4, 'Clean stall, friendly aunty, queue moves quickly.'],
  ['Hafiz', 5, 'Sambal is spicy and addictive. Will come back.'],
  ['Siew', 3, 'Good variety for the price, a solid lunch spot.'],
  ['Raj', 4, 'Fresh dishes, decent portions. Parking can be tricky.'],
];
