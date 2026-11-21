/**
 * ライフログ_鑑賞記録DB — Wikipedia API 自動補完 & プラットフォーム正規化 GAS
 *
 * 【機能】
 * 1. カスタムメニュー「🎬 ライフログ管理」から選択行または未取得行のWikipedia情報を自動補完
 * 2. スマホ対応：B列「自動補完」チェックボックスを ON にすると自動実行し、完了後に OFF へ戻す
 * 3. User-Agent ヘッダーを設定して Wikipedia API の 403 エラーを回避
 * 4. プラットフォーム表記揺れを PLATFORM_TARGETS 辞書で正規化（「映画館」判定ルール含む）
 * 5. 主要キャストは最大 20 名までに制限して格納
 */

function getScriptPropOrDefault_(key, defaultValue) {
  try {
    if (typeof PropertiesService !== 'undefined') {
      const val = PropertiesService.getScriptProperties().getProperty(key);
      if (val && String(val).trim()) return String(val).trim();
    }
  } catch (e) { /* fallback to default */ }
  return defaultValue;
}

const SHEET_NAME = '鑑賞記録DB';
const WATCH_SS_ID = getScriptPropOrDefault_('STAGING_WATCH_SS_ID', '1dvf7aVJA_B8SgkIB1qGzJztZ6hRPiA7SLb0xssY142E');
const DIARY_SS_ID = getScriptPropOrDefault_('STAGING_DIARY_SS_ID', '1_UnbcNhxtEkV7vLagxreIeyELbY3NBLU5bS8pp4YQ1A');
const DIARY_SHEET_NAME = '日記DB';
const LOCATION_PRESET_SHEET_NAME = '場所プリセット';
const MEAL_SHEET_NAME = '食事記録DB';
const MEAL_HEADERS = ['ID', '日付', '食事区分', '料理名', '写真URL', '写真ID', 'カロリー(kcal)', 'タンパク質(g)', '脂質(g)', '炭水化物(g)', '糖質(g)', '食物繊維(g)', '塩分(g)', '所見・メモ', 'データソース'];
const JOURNAL_IMAGES_FOLDER_ID = getScriptPropOrDefault_('STAGING_JOURNAL_IMAGES_FOLDER_ID', '1kPfAX4TvDpMwokoinA2ga-nCwoePkLyo');
const JOURNAL_DOCS_FOLDER_ID = getScriptPropOrDefault_('STAGING_JOURNAL_DOCS_FOLDER_ID', '1GqzKeXduc0UF-3Mb8nihfs3SVMSbOPSI');
const YEAR_DOC_IDS = (function () {
  const defaults = {
    '2012': '1cU3EBa5HnaRnBQq4diBoseawuP_HZxVMvt2a4yOtYKk',
    '2023': '1kq2hbOtbA_oMDdZ9V1Zfduw8gXG3YhQr5K_HS-NfCr8',
    '2024': '1zw5PJeGd0Ez5Z53Q9L337hwqB_zRzEHPn-ti6tsj8l8',
    '2025': '1ad_I1JPnJyvkiIdL_2tAjDA0bearBM5mld9I0bzXyg8',
    '2026': '114VekVP1Atik_cds8n_0N6rXmqRjO9l8GvETh570zKI',
  };
  const raw = getScriptPropOrDefault_('STAGING_YEAR_DOC_IDS_JSON', '');
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) { /* fallback */ }
  return defaults;
})();
const WIKI_USER_AGENT = 'LifelogNotionBot/1.0 (personal use)';
const MAX_CAST = 20;

// 列番号（1-indexed）
const COL = {
  ID: 1,
  AUTO_FETCH: 2,     // チェックボックス（スマホ対応トリガー）
  TITLE: 3,          // タイトル
  CATEGORY: 4,       // 区分（ドラマ / 映画 / アニメ / 本 / その他）
  WATCH_DATE: 5,     // 鑑賞日・完了日
  STATUS: 6,         // ステータス
  RATING: 7,         // 評価（スコア）
  PLATFORM: 8,       // プラットフォーム（正規化済み）
  RELEASE_YEAR: 9,   // 公開年・放送年
  CAST: 10,          // 出演者（主要キャスト最大20名）
  STAFF: 11,         // 監督・脚本・原作等
  SUMMARY: 12,       // 作品概要（Wikipedia）
  MEMO: 13,          // 感想・メモ
  RELATED_URL: 14,   // 関連URL
  NOTION_URL: 15,    // Notion元URL
};

// プラットフォーム表記揺れ正規化辞書
const PLATFORM_TARGETS = {
  'NHK': ['日本放送協会', 'NHK総合', 'NHK Eテレ', 'NHK G', 'NHK BSプレミアム', 'NHK BS'],
  '日本テレビ': ['日テレ', 'NTV', '日本テレビ放送網'],
  'TBS': ['TBSテレビ', '東京放送'],
  'フジテレビ': ['フジテレビジョン', 'フジ', 'CX'],
  'テレビ朝日': ['テレ朝', 'EX'],
  'テレビ東京': ['テレ東', 'TX'],
  '関西テレビ': ['カンテレ', 'KTV'],
  '読売テレビ': ['ytv', 'YTV'],
  'WOWOW': ['ワウワウ'],
  'Netflix': ['ネットフリックス', 'ネトフリ'],
  'Amazon Prime Video': ['Amazon Prime', 'アマプラ', 'Amazonプライムビデオ', 'Amazonプライム', 'Prime Video'],
  'U-NEXT': ['ユーネクスト', 'UNEXT'],
  'Hulu': ['フールー'],
  'Disney+': ['Disney', 'ディズニープラス', 'Disney Plus'],
  'Apple TV+': ['Apple TV', 'AppleTV+'],
  'ABEMA': ['AbemaTV', 'アベマ'],
  'TVer': ['ティーバー'],
  '映画館': ['劇場公開', '劇場鑑賞', 'シネマ', 'TOHOシネマズ', '109シネマズ', 'イオンシネマ', 'ユナイテッド・シネマ', 'MOVIX'],
};

