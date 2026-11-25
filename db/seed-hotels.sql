-- Seed / upsert 64 Toronto hotels within 10km of Washwell (222 The Esplanade, Unit 7)
-- Safe to run multiple times — ON CONFLICT updates address only, never overwrites existing config
-- Run in Neon SQL editor

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS address JSONB;

INSERT INTO hotels (name, slug, address, created_at, updated_at) VALUES

-- ── 5-Star & Luxury ──────────────────────────────────────────────────────────
('The Ivy At Verity',              'the-ivy-at-verity',              '{"street_address":["111d Queen St E"],"city":"Toronto","state":"ON","zip_code":"M5C 1S2","country":"CA"}', NOW(), NOW()),
('The Omni King Edward Hotel',     'omni-king-edward',               '{"street_address":["37 King St E"],"city":"Toronto","state":"ON","zip_code":"M5C 1E9","country":"CA"}', NOW(), NOW()),
('Fairmont Royal York',            'fairmont-royal-york',            '{"street_address":["100 Front St W"],"city":"Toronto","state":"ON","zip_code":"M5J 1E3","country":"CA"}', NOW(), NOW()),
('The St. Regis Toronto',          'st-regis-toronto',               '{"street_address":["325 Bay St"],"city":"Toronto","state":"ON","zip_code":"M5H 4G3","country":"CA"}', NOW(), NOW()),
('The Ritz-Carlton Toronto',       'ritz-carlton-toronto',           '{"street_address":["181 Wellington St W"],"city":"Toronto","state":"ON","zip_code":"M5V 0C3","country":"CA"}', NOW(), NOW()),
('Shangri-La Toronto',             'shangri-la-toronto',             '{"street_address":["188 University Ave"],"city":"Toronto","state":"ON","zip_code":"M5H 0A3","country":"CA"}', NOW(), NOW()),
('1 Hotel Toronto',                '1-hotel-toronto',                '{"street_address":["550 Wellington St W"],"city":"Toronto","state":"ON","zip_code":"M5V 2V4","country":"CA"}', NOW(), NOW()),
('Hotel X Toronto',                'hotel-x-toronto',                '{"street_address":["111 Princes Blvd"],"city":"Toronto","state":"ON","zip_code":"M6K 3C3","country":"CA"}', NOW(), NOW()),
('Four Seasons Hotel Toronto',     'four-seasons-toronto',           '{"street_address":["60 Yorkville Ave"],"city":"Toronto","state":"ON","zip_code":"M4W 0A4","country":"CA"}', NOW(), NOW()),
('Park Hyatt Toronto',             'park-hyatt-toronto',             '{"street_address":["4 Avenue Rd"],"city":"Toronto","state":"ON","zip_code":"M5R 2E8","country":"CA"}', NOW(), NOW()),
('The Hazelton Hotel',             'hazelton-hotel',                 '{"street_address":["118 Yorkville Ave"],"city":"Toronto","state":"ON","zip_code":"M5R 1C2","country":"CA"}', NOW(), NOW()),
('Windsor Arms Hotel',             'windsor-arms-hotel',             '{"street_address":["18 St Thomas St"],"city":"Toronto","state":"ON","zip_code":"M5S 3E7","country":"CA"}', NOW(), NOW()),

-- ── Major Chains, Lifestyle & Upscale ────────────────────────────────────────
('Novotel Toronto Centre',         'novotel-toronto-centre',         '{"street_address":["45 The Esplanade"],"city":"Toronto","state":"ON","zip_code":"M5E 1W2","country":"CA"}', NOW(), NOW()),
('Holiday Inn Express Toronto Downtown', 'holiday-inn-express-downtown', '{"street_address":["111 Lombard St"],"city":"Toronto","state":"ON","zip_code":"M5C 2T9","country":"CA"}', NOW(), NOW()),
('Executive Hotel Cosmopolitan Toronto', 'executive-hotel-cosmopolitan', '{"street_address":["8 Colborne St"],"city":"Toronto","state":"ON","zip_code":"M5E 1E1","country":"CA"}', NOW(), NOW()),
('One King West Hotel & Residence', 'one-king-west',                 '{"street_address":["1 King St W"],"city":"Toronto","state":"ON","zip_code":"M5H 1A1","country":"CA"}', NOW(), NOW()),
('Cambridge Suites Toronto',       'cambridge-suites-toronto',       '{"street_address":["15 Richmond St E"],"city":"Toronto","state":"ON","zip_code":"M5C 1N2","country":"CA"}', NOW(), NOW()),
('TOOR Hotel - JDV by Hyatt',      'toor-hotel-toronto',             '{"street_address":["203 Jarvis St"],"city":"Toronto","state":"ON","zip_code":"M5B 0E7","country":"CA"}', NOW(), NOW()),
('Pantages Hotel Downtown Toronto', 'pantages-hotel',                '{"street_address":["200 Victoria St"],"city":"Toronto","state":"ON","zip_code":"M5B 2R3","country":"CA"}', NOW(), NOW()),
('The Westin Harbour Castle Toronto', 'westin-harbour-castle',       '{"street_address":["1 Harbour Square"],"city":"Toronto","state":"ON","zip_code":"M5J 1A6","country":"CA"}', NOW(), NOW()),
('Le Germain Hotel Maple Leaf Square', 'le-germain-maple-leaf-square','{"street_address":["75 Bremner Blvd"],"city":"Toronto","state":"ON","zip_code":"M5J 0A1","country":"CA"}', NOW(), NOW()),
('Delta Hotels by Marriott Toronto', 'delta-hotels-toronto',         '{"street_address":["75 Lower Simcoe St"],"city":"Toronto","state":"ON","zip_code":"M5J 3A6","country":"CA"}', NOW(), NOW()),
('InterContinental Toronto Centre', 'intercontinental-toronto',      '{"street_address":["225 Front St W"],"city":"Toronto","state":"ON","zip_code":"M5V 2X3","country":"CA"}', NOW(), NOW()),
('Toronto Marriott City Centre',   'marriott-city-centre',           '{"street_address":["1 Blue Jays Way"],"city":"Toronto","state":"ON","zip_code":"M5V 1J4","country":"CA"}', NOW(), NOW()),
('Hilton Toronto',                 'hilton-toronto',                 '{"street_address":["145 Richmond St W"],"city":"Toronto","state":"ON","zip_code":"M5H 2L2","country":"CA"}', NOW(), NOW()),
('Sheraton Centre Toronto Hotel',  'sheraton-centre-toronto',        '{"street_address":["123 Queen St W"],"city":"Toronto","state":"ON","zip_code":"M5H 2M9","country":"CA"}', NOW(), NOW()),
('DoubleTree by Hilton Toronto Downtown', 'doubletree-toronto',      '{"street_address":["108 Chestnut St"],"city":"Toronto","state":"ON","zip_code":"M5G 1R3","country":"CA"}', NOW(), NOW()),
('Marriott Downtown at CF Toronto Eaton Centre', 'marriott-eaton-centre', '{"street_address":["525 Bay St"],"city":"Toronto","state":"ON","zip_code":"M5G 2L2","country":"CA"}', NOW(), NOW()),
('Chelsea Hotel Toronto',          'chelsea-hotel-toronto',          '{"street_address":["33 Gerrard St W"],"city":"Toronto","state":"ON","zip_code":"M5G 1Z4","country":"CA"}', NOW(), NOW()),
('Holiday Inn Toronto Downtown Centre', 'holiday-inn-downtown-centre','{"street_address":["30 Carlton St"],"city":"Toronto","state":"ON","zip_code":"M5B 2E9","country":"CA"}', NOW(), NOW()),
('Courtyard by Marriott Downtown Toronto', 'courtyard-marriott-toronto', '{"street_address":["475 Yonge St"],"city":"Toronto","state":"ON","zip_code":"M4Y 1X7","country":"CA"}', NOW(), NOW()),
('Hampton Inn & Suites Toronto Downtown', 'hampton-inn-toronto',     '{"street_address":["300 Jarvis St"],"city":"Toronto","state":"ON","zip_code":"M5B 2C5","country":"CA"}', NOW(), NOW()),
('Hotel Riu Plaza Toronto',        'hotel-riu-plaza-toronto',        '{"street_address":["30 Widmer St"],"city":"Toronto","state":"ON","zip_code":"M5V 0N5","country":"CA"}', NOW(), NOW()),
('Hyatt Regency Toronto',          'hyatt-regency-toronto',          '{"street_address":["370 King St W"],"city":"Toronto","state":"ON","zip_code":"M5V 1J9","country":"CA"}', NOW(), NOW()),
('Le Germain Hotel Toronto',       'le-germain-toronto',             '{"street_address":["30 Mercer St"],"city":"Toronto","state":"ON","zip_code":"M5V 1H3","country":"CA"}', NOW(), NOW()),
('Revery Toronto Downtown',        'revery-toronto',                 '{"street_address":["92 Peter St"],"city":"Toronto","state":"ON","zip_code":"M5V 2G5","country":"CA"}', NOW(), NOW()),
('SoHo Hotel Toronto',             'soho-hotel-toronto',             '{"street_address":["318 Wellington St W"],"city":"Toronto","state":"ON","zip_code":"M5V 3T4","country":"CA"}', NOW(), NOW()),
('Bisha Hotel Toronto',            'bisha-hotel-toronto',            '{"street_address":["80 Blue Jays Way"],"city":"Toronto","state":"ON","zip_code":"M5V 2G3","country":"CA"}', NOW(), NOW()),
('Ace Hotel Toronto',              'ace-hotel-toronto',              '{"street_address":["51 Camden St"],"city":"Toronto","state":"ON","zip_code":"M5V 1V2","country":"CA"}', NOW(), NOW()),
('Radisson Blu Toronto Downtown',  'radisson-blu-toronto',           '{"street_address":["249 Queens Quay W"],"city":"Toronto","state":"ON","zip_code":"M5J 2N5","country":"CA"}', NOW(), NOW()),
('Residence Inn by Marriott Toronto Downtown', 'residence-inn-toronto', '{"street_address":["255 Wellington St W"],"city":"Toronto","state":"ON","zip_code":"M5V 3P9","country":"CA"}', NOW(), NOW()),
('W Toronto',                      'w-toronto',                      '{"street_address":["90 Bloor St E"],"city":"Toronto","state":"ON","zip_code":"M4W 1A7","country":"CA"}', NOW(), NOW()),
('Canopy by Hilton Toronto Yorkville', 'canopy-hilton-yorkville',    '{"street_address":["387 Bloor St E"],"city":"Toronto","state":"ON","zip_code":"M4W 1H7","country":"CA"}', NOW(), NOW()),
('The Anndore House',              'anndore-house',                  '{"street_address":["15 Charles St E"],"city":"Toronto","state":"ON","zip_code":"M4Y 1S1","country":"CA"}', NOW(), NOW()),
('Kimpton Saint George Hotel',     'kimpton-saint-george',           '{"street_address":["280 Bloor St W"],"city":"Toronto","state":"ON","zip_code":"M5S 1V8","country":"CA"}', NOW(), NOW()),
('The Yorkville Royal Sonesta Hotel Toronto', 'yorkville-royal-sonesta', '{"street_address":["220 Bloor St W"],"city":"Toronto","state":"ON","zip_code":"M5S 1T8","country":"CA"}', NOW(), NOW()),
('Toronto Don Valley Hotel & Suites', 'toronto-don-valley',          '{"street_address":["175 Wynford Dr"],"city":"North York","state":"ON","zip_code":"M3C 1J3","country":"CA"}', NOW(), NOW()),

-- ── Independent, Boutique, Inns & Residences ─────────────────────────────────
('Nester Finn St. Lawrence Market', 'nester-finn-st-lawrence',       '{"street_address":["197 King St E"],"city":"Toronto","state":"ON","zip_code":"M5A 1J5","country":"CA"}', NOW(), NOW()),
('Hotel Beebop',                   'hotel-beebop',                   '{"street_address":["39 Mutual St"],"city":"Toronto","state":"ON","zip_code":"M5B 2A7","country":"CA"}', NOW(), NOW()),
('Hotel Victoria',                 'hotel-victoria-toronto',         '{"street_address":["56 Yonge St"],"city":"Toronto","state":"ON","zip_code":"M5E 1G5","country":"CA"}', NOW(), NOW()),
('The Broadview Hotel',            'broadview-hotel',                '{"street_address":["106 Broadview Ave"],"city":"Toronto","state":"ON","zip_code":"M4M 2G1","country":"CA"}', NOW(), NOW()),
('The Rex Hotel',                  'the-rex-hotel',                  '{"street_address":["194 Queen St W"],"city":"Toronto","state":"ON","zip_code":"M5V 1Z1","country":"CA"}', NOW(), NOW()),
('Hotel Ocho',                     'hotel-ocho',                     '{"street_address":["195 Spadina Ave"],"city":"Toronto","state":"ON","zip_code":"M5T 2C3","country":"CA"}', NOW(), NOW()),
('The Drake Hotel',                'the-drake-hotel',                '{"street_address":["1150 Queen St W"],"city":"Toronto","state":"ON","zip_code":"M6J 1J3","country":"CA"}', NOW(), NOW()),
('Gladstone House',                'gladstone-house',                '{"street_address":["1214 Queen St W"],"city":"Toronto","state":"ON","zip_code":"M6J 1J6","country":"CA"}', NOW(), NOW()),
('Town Inn Suites',                'town-inn-suites',                '{"street_address":["620 Church St"],"city":"Toronto","state":"ON","zip_code":"M4Y 2G2","country":"CA"}', NOW(), NOW()),
('Royal Oak Inn',                  'royal-oak-inn-toronto',          '{"street_address":["376 Dundas St E"],"city":"Toronto","state":"ON","zip_code":"M5A 2A5","country":"CA"}', NOW(), NOW()),
('Park Inn Toronto',               'park-inn-toronto',               '{"street_address":["118 Shuter St"],"city":"Toronto","state":"ON","zip_code":"M5A 1V8","country":"CA"}', NOW(), NOW()),
('Pembroke Inn',                   'pembroke-inn',                   '{"street_address":["130 Pembroke St"],"city":"Toronto","state":"ON","zip_code":"M5A 2N8","country":"CA"}', NOW(), NOW()),
('Isabella Hotel & Suites',        'isabella-hotel-suites',          '{"street_address":["556 Sherbourne St"],"city":"Toronto","state":"ON","zip_code":"M4X 1W4","country":"CA"}', NOW(), NOW()),
('Saint Lawrence Residences and Suites', 'saint-lawrence-residences', '{"street_address":["135 Jarvis St"],"city":"Toronto","state":"ON","zip_code":"M5C 2H6","country":"CA"}', NOW(), NOW()),
('Toronto Inn York',               'toronto-inn-york',               '{"street_address":["14 York St"],"city":"Toronto","state":"ON","zip_code":"M5J 0B1","country":"CA"}', NOW(), NOW()),
('Super 8 by Wyndham Downtown Toronto', 'super-8-toronto',           '{"street_address":["222 Spadina Ave"],"city":"Toronto","state":"ON","zip_code":"M5T 3B3","country":"CA"}', NOW(), NOW()),
('Howard Johnson by Wyndham Toronto Downtown West', 'howard-johnson-toronto', '{"street_address":["14 Roncesvalles Ave"],"city":"Toronto","state":"ON","zip_code":"M6R 2K3","country":"CA"}', NOW(), NOW())

ON CONFLICT (slug) DO UPDATE SET
  address    = EXCLUDED.address,
  updated_at = NOW();

-- Verify
SELECT COUNT(*) AS total_hotels, COUNT(address) AS with_address FROM hotels;
