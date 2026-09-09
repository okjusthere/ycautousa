// Public staff information supplied in Meet Our Staff.docx (September 2026).
// Missing contact details remain null; never substitute another person's details.
export interface StaffMember {
  id: string;
  name: string;
  title: string;
  titleZh: string;
  phone: string | null;
  email: string | null;
  wechat: string | null;
  bio?: string;
  bioZh?: string;
}

export const staffMembers: StaffMember[] = [
  {
    id: "kai",
    name: "Kai",
    title: "General Manager",
    titleZh: "总经理",
    phone: null,
    email: null,
    wechat: null,
  },
  {
    id: "maggie-yu",
    name: "Maggie Yu",
    title: "Sales Manager",
    titleZh: "销售经理",
    phone: "929-939-1177",
    email: "Maggieyu614@gmail.com",
    wechat: "ruru_yu614",
    bioZh: "优选汽车创始人之一，深耕二十载车行，以诚选好车",
    bio: "Co-founder of YC Auto, with two decades in the car business and an honest approach to choosing quality vehicles.",
  },
  {
    id: "sophie-wang",
    name: "Sophie Wang",
    title: "Sales Manager",
    titleZh: "销售经理",
    phone: "347-200-0593",
    email: "Sophie@youxuancars.com",
    wechat: "Sophiewang01",
    bioZh: "细节决定成败，用心选最合适您的好车。",
    bio: "Details matter. I take care to find the right car for you.",
  },
  {
    id: "roy-ma",
    name: "Roy Ma",
    title: "Service Tech",
    titleZh: "维修技师",
    phone: "718-414-5026",
    email: null,
    wechat: "MustangRY",
    bioZh: "全能选手，六边形马战士",
    bio: "An all-rounder, ready to put a wide range of skills to work.",
  },
  {
    id: "daidai",
    name: "Daidai",
    title: "Inventory Manager",
    titleZh: "库存经理",
    phone: "929-362-9122",
    email: null,
    wechat: "D9293629122",
    bioZh: "经验成就专业，专业赢得信赖。",
    bio: "Experience builds expertise. Expertise earns trust.",
  },
  {
    id: "nana",
    name: "Nana",
    title: "Sales Consultant",
    titleZh: "销售顾问",
    phone: "718-496-3243",
    email: null,
    wechat: "nanaaa1216",
    bioZh: "靠谱车源在线，省心买车找NANA",
    bio: "Find dependable vehicles and a simpler buying experience with Nana.",
  },
  {
    id: "yuzu",
    name: "Yuzu",
    title: "Sales Consultant",
    titleZh: "销售顾问",
    phone: "917-584-6621",
    email: "yuzu0422@yahoo.com",
    wechat: "Yuzu_mocha",
    bioZh: "买德国车找我就对了",
    bio: "Looking for a German car? Talk to me.",
  },
  {
    id: "vicky",
    name: "Vicky",
    title: "Sales Consultant",
    titleZh: "销售顾问",
    phone: null,
    email: null,
    wechat: null,
  },
  {
    id: "jackson-zhu",
    name: "Jackson Zhu",
    title: "Sales Consultant",
    titleZh: "销售顾问",
    phone: "917-293-9161",
    email: null,
    wechat: "JCzhuphotography",
  },
];
