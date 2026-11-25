const APP_VERSION = 'v1.36.0';
const DEFAULT_RELEASE_NOTES = [
  { version: 'v1.36.0', date: '2026-11-25', title: '鑑賞記録URLバッジ復旧・メモ内URL自動移管＆3段階閲覧遷移（一覧→閲覧→編集）', items: ['鑑賞記録カードへ関連URLバッジ表示を復旧し、保存時にメモ内URL（Markdownリンク・<URL>・\\[text\\](URL)・Wikipedia括弧付き・裸URL）を関連URL欄へ重複排除マージ＆メモから一掃する自動移管（部分更新保護付き）およびバックアップ付一括移管関数（migrateWatchMemoUrls）を実装（3-54）', '日記・鑑賞記録を「コンパクト一覧 → タップで1記事閲覧表示（全文・全写真・詳細）→ 本文タップ／編集ボタンで編集モード」の3段階遷移へ変更（リンク・写真・テキスト選択時の誤遷移防止＆一覧復帰時のスクロール位置保持対応）（3-55）'] },
  { version: 'v1.35.0', date: '2026-11-25', title: '日記の起票時刻自動記入＆一覧閲覧性向上（年ピッカー・ヘッダ1行化・コンパクトカード）', items: ['日記の新規作成時にローカル現在時刻（HH:MM）を初期自動記入し、変更保存・意図的な空欄保存・既存編集時の時刻保持および食事導線／API作成時のJST時刻補完に対応（3-52）', 'GAS側（?api=diary / ?api=watch）から年別件数サマリー（yearCounts）を配信し、エントリが存在する年限定の移動（範囲外ボタン無効化）と件数付き年ピッカーを実装（3-53）', '日記・鑑賞記録の一覧ヘッダをスマホ幅で1行ツールバー＋展開式検索ドロワーへ集約し、カードをコンパクト化して1画面あたりの一覧性を大幅に向上（3-53）'] },
  { version: 'v1.34.1', date: '2026-11-25', title: '日記のテキスト追記・保存時のスプレッドシートサービスエラー修正＆自動リトライ導入', items: ['updateDiaryEntry で写真変更がない更新時に K列（=IMAGE() の CellImage オブジェクト）を setValues() へ書き戻さないよう分割更新＋非Dateオブジェクト除去を実装し、「Exception: サービス エラー: スプレッドシート」の根本原因を解消', 'doPost / doGet の例外捕捉へスタックトレース・action・対象ID/row の console.error 出力を追加し、全シート参照の getSheetByName 統一を検証', '一時的なスプレッドシートサービスエラーを吸収する自動リトライ（1〜2秒待機・最大2回）を冪等な読み取り・更新処理へ導入（二重記録防止のため追加系は除外）'] },
  { version: 'v1.34.0', date: '2026-11-23', title: '場所ピッカーの近傍優先検索＆支店名0件時のクエリ緩和リトライ', items: ['編集中日記の既存地点（無ければ直近履歴地点）を基準点として Nominatim へ近傍 viewbox バイアス（boundedなし）を付与し、取得候補を基準点からの距離順で並べ替えて表示', '「大戸屋 浅草橋店」など支店名付きで0件になった場合、「大戸屋 浅草橋」→「大戸屋」と段階的に語を落として自動再検索し、ステータスへ緩和検索した旨を表示（インライン／詳細モーダル共通）'] },
  { version: 'v1.33.1', date: '2026-11-23', title: 'Mac・スマホでの起動直後／タブ移動直後のスクロール・タップ不能を修正', items: ['html, body の overflow-x: hidden を overflow-x: clip へ変更し、macOS Safari / Chrome でのトラックパッド・ホイール縦スクロール固着を解消', 'touchstart での preventDefault() を完全廃止（passive: true 化）し、スマホ画面端からの縦スクロール開始および下部タブバー端寄りタップが確実に反応するよう修正', 'JSエッジスワイプ抑止を「左右端28px以内開始」かつ「明確な横優勢（dx > 24 かつ dx > dy × 2）」の touchmove のみに限定'] },
  { version: 'v1.33.0', date: '2026-11-23', title: '左右スワイプ・プルリロード禁止＆出演者チップ・リスト起点フル項目編集UI・HTMLサニタイズ', items: ['CSS overscroll-behavior:none＋JSエッジスワイプガードにより、左右スワイプ履歴遷移やプルリロードを抑止（縦スクロール・入力欄・横スクロール許可チップ列は維持）', '鑑賞記録の出演者・監督スタッフを構造化チップUI（個別削除・カンマ一括追加・既存候補サジェスト・重複追加ブロック＆ハイライト）へ刷新し、DB互換のカンマ区切り保存を維持', '日記・鑑賞記録をリスト起点＋記事タップで全項目独立併存の編集画面へ遷移する導線へ統一（未保存変更時の破棄確認ガード付き）', '表示・保存時のHTMLタグ残骸サニタイズおよびバックアップシート付きの鑑賞記録DB一括クレンジング関数（cleanseWatchHtmlTags）を実装'] },
  { version: 'v1.32.0', date: '2026-11-22', title: '場所ピッカーの同名・別座標候補の識別＆座標置換対応', items: ['場所ピッカーの追加済み判定を「名前一致＋座標近接一致（小数3桁丸めまたは100m以内）」へ厳密化し、同名・別座標や座標未設定の候補が除外されないよう修正', '履歴統合時に同名・別座標の検索候補を落とさないよう改善し、候補に所在地・座標と「座標を更新」バッジを表示', '既存と同名の別座標候補を選択した際、チップを重複増殖させず既存チップの座標を新しい座標へ安全に置換（インライン／詳細モーダル共通）'] },
  { version: 'v1.31.0', date: '2026-11-22', title: '場所ピッカー候補表示修正＆鑑賞記録検索の全ステータス対象化', items: ['インライン編集・詳細モーダルの場所ピッカー候補リストを統一UI（最小タップ領域44px・縦スクロール対応）へ改修し、blurタイマー競合やボタン種別によるiPadでの非表示・タップ不可を解消', '鑑賞記録タブのキーワード検索時に暗黙の「進行中」フィルタを自動解除して全ステータス（「すべて」）を対象化し、検索中の手動再絞り込みおよび検索クリア時の元ステータス復帰に対応'] },
  { version: 'v1.30.0', date: '2026-11-22', title: '年別Googleドキュメント同期の深夜バッチ化', items: ['保存時のリアルタイム／非同期Doc同期（syncDiaryDoc）を廃止し、日記保存をスプレッドシート1リクエスト完結へ単純化', '変更のあった年（DIRTY_DOC_YEARS）のみをGAS時間主導トリガー（毎日深夜3時）でスプレッドシート正本から年別Docへクリーン再生成する深夜バッチ同期（syncDirtyDiaryDocsNightly）を実装'] },
  { version: 'v1.29.0', date: '2026-11-21', title: '基盤リファクタリング（モジュール分割・ESLint・自動テスト＆検証環境分離）', items: ['単一肥大化していた index.html（3,930行）を css/style.css＋機能別 js/*.js（8ファイル）へ、GAS（2,007行）を機能別6ファイル（Config/Code/Diary/Watch/Wiki/Meals.gs）へ分割', 'モーダルとインラインで重複していた場所検索・現在地取得ロジックを js/location.js の共通コアへ統合', 'ESLint（未定義関数・未使用変数検出）およびモックAPIベースの自動回帰テスト（npm run check）とステージング環境分離機構を導入'] },
  { version: 'v1.28.0', date: '2026-11-21', title: '場所キーワード検索の海外地名混入修正＆重複統合', items: ['Nominatimキーワード検索（インライン／詳細編集の両方）へ countrycodes=jp を付与し、海外地名混入の引き金だった addressdetails=1 を削除', 'name＋座標（小数3桁丸め）一致の重複候補を1件に統合する重複除去（dedupeLocationCandidates）を追加'] },
  { version: 'v1.27.0', date: '2026-11-20', title: '日記インライン場所ピッカー全機能化＆保存不達・入力消失の緊急修正', items: ['日記カードのインライン編集でGPS現在地近傍スポット取得（📍）・キーワード検索（🔍 Nominatim＋国土地理院フォールバック）・スポット並び替え（◀▶）と削除をカード上で完結', '保存リクエストへタイムアウト（25秒／写真時45秒）・clientRequestId冪等性・未送信下書きのlocalStorage永続保持と再送バー（#unsent-diary-bar）を実装し、無音失敗や入力消失を根絶', 'インライン保存時の未定義関数呼び出し（triggerDiaryDocSyncWithRetry）およびエラートースト背景色バグを修正'] },
  { version: 'v1.26.0', date: '2026-11-19', title: 'Wikipedia補完の区分別曖昧さ回避＆作品記事判定', items: ['Wikipedia補完（GAS側）で区分別の曖昧さ回避記事（例：会社員 (ドラマ)）を優先探索し、一般用語記事（例：サラリーマン）への取り違えを防止', 'リダイレクト解決後のカテゴリ・リード文による作品記事健全性チェックを追加し、作品候補が無い場合は一般用語で埋めず空欄のまま見送り'] },
  { version: 'v1.25.0', date: '2026-11-19', title: '横断検索の結果リストへ戻る導線＆閲覧済マーク', items: ['横断検索ヒットから記事へ遷移後、「← 検索結果に戻る」バーを表示し、再検索通信なしで直前の検索結果・スクロール位置を復元', '「飛ぶ→戻る→別のヒットへ飛ぶ」の繰り返し遷移と、直前閲覧／閲覧済みバッジ表示に対応', 'インライン編集中に「戻る」を押した際の3-36未保存保護ルールに対応'] },
  { version: 'v1.24.0', date: '2026-11-19', title: '横断検索ヒットから記事本体への遷移対応', items: ['横断検索（🌐）のヒットカードをタップするとモーダルを閉じ、該当タブ（日記／鑑賞記録）で対象月の完全なカード（本文全文・写真・編集ボタン）を表示してスクロール＆ハイライト', '鑑賞記録の「完了」作品や古い作品へ遷移時はステータスフィルタを自動解除し段階描画も自動展開', '遷移時に別カードをインライン編集中の場合は3-36の未保存保護ルールを適用'] },
  { version: 'v1.23.0', date: '2026-11-19', title: '検索・閲覧のサーバー側化＆初期取得軽量化', items: ['起動時の初期取得を日記＝直近3か月・鑑賞記録＝直近100件（進行中は全件確実に含む）へ軽量化', 'GAS側での全期間全文検索（日記・鑑賞・横断検索）、DB全体での新しい順／古い順切替、年・月ナビ（年またぎ連続移動＋直近復帰）を実装', '場所履歴および出演者・スタッフ既存タグ候補＋DB実数を軽量マスター配信で全件維持'] },
  { version: 'v1.22.0', date: '2026-11-19', title: '日記・鑑賞カード編集UI最適化＆未保存保護', items: ['日記・鑑賞記録のインライン編集中は表示用ボタン行を非表示にし、「保存／キャンセル／詳細」の1行へ一本化', '日記インライン編集にタイトル入力欄および場所スポット（チップ削除・プリセット/履歴追加・重複防止・座標解決維持）を追加', '「⚙️ 日付・写真などの詳細」遷移時・別カード切替時・キャンセル時の未保存変更保護（先保存・失敗時保持）を実装'] },
  { version: 'v1.21.0', date: '2026-11-19', title: 'iPhoneホーム画面PWAのステータスバー重なり解消（safe-area対応）', items: ['viewportメタに viewport-fit=cover を追加し、header上部に env(safe-area-inset-top) を確保してタイトル・更新ボタン・更新バナーがiOSステータスバー領域に重ならないよう修正', 'インセット0のAndroid/Pixel環境では従来どおりのレイアウトを維持'] },
  { version: 'v1.20.0', date: '2026-11-19', title: '旧ブログ2012年日記3件の追加＆iPhoneヘッダー改行崩れ修正', items: ['2012年分の年別アーカイブDocを新設してYEAR_DOC_IDSへ組み込み、旧ブログ「気が向いた時に文章を、」の日記3件（2012-10-25 / 2012-11-01 / 2012-12-15）を原文のまま日記DBへ登録（日付降順ソートも統一）', 'iPhone（幅390px）でタイトル「📚 ライフログ・ダッシュボード」と「🔄 更新」ボタンが折り返す問題を修正（nowrap・flex-shrink:0・レスポンシブフォントサイズ調整）'] },
  { version: 'v1.19.0', date: '2026-11-19', title: '場所クイック候補「自宅」「会社」のGPS座標＆Googleマップ連携', items: ['「自宅」「会社」のGPS座標（緯度・経度）を非公開スプレッドシート（場所プリセット）から安全に読み込み、公開コードへ個人情報を平文記載せずに座標を自動付与', '「自宅」「会社」のワンタップ追加・手入力時に座標（lat, lng）を確実に保存し、日記カード上の個別バッジや「Googleマップで開く／経路を開く」から座標ベースでGoogleマップを開けるよう対応'] },
  { version: 'v1.18.0', date: '2026-11-19', title: '出演者・監督スタッフのタグ候補＆使用件数表示', items: ['鑑賞記録の編集モーダルおよびカード内インライン編集で「出演者」「監督・スタッフ」入力時に既存表記のタグ候補＋DB実数（例：中谷美紀（12））を提示', '候補選択で既存表記をそのまま挿入し表記揺れを防止（候補にない新規名の自由入力もそのまま保存可能）'] },
  { version: 'v1.17.0', date: '2026-11-19', title: '当日日付初期セット＆場所選択UI改善', items: ['日記・鑑賞記録・食事の新規作成時にローカルタイムゾーン基準の当日日付（YYYY-MM-DD）を自動セット（UTCズレ解消）', '場所入力欄の検索前候補として「自宅」「会社」（座標引き継ぎ対応）＋過去の場所履歴を即時リスト表示', '空欄検索・現在地取得（📍）でGPS近傍スポットをリスト表示・ワンタップ追加できるよう改善'] },
  { version: 'v1.16.0', date: '2026-11-18', title: '変更履歴モーダル＆バージョンボタン化', items: ['ヘッダーのバージョンバッジをタップ可能なボタン（📋 v1.16.0）へ変更', 'v1.0.0〜最新までの変更履歴（リリースノート）を縦スクロール閲覧できるモーダルポップアップを追加'] },
  { version: 'v1.15.0', date: '2026-11-18', title: '関連URLカード表示＆インライン直接編集UI', items: ['鑑賞記録カード上に「関連URL」クリック可能バッジ（改行・カンマ複数URL対応）を常時表示', '日記本文・鑑賞記録感想メモをカード上でそのまま書き足しできるインライン直接編集UIを実装', '詳細編集モーダルの本文・感想メモ入力欄を大幅に拡大（220px+）'] },
  { version: 'v1.14.1', date: '2026-11-18', title: 'Wikipedia補完時の記事消失バグ修正', items: ['Wikipedia API URL内のパイプ文字エンコード漏れによるGAS例外を修正', '補完時の既存キャスト・概要・ステータス・メモ保護およびエラー時状態保持を実装'] },
  { version: 'v1.14.0', date: '2026-11-18', title: 'Markdownリンク・URL自動ハイパーリンク化', items: ['日記本文および鑑賞記録の感想メモ・概要内の [テキスト](URL) と裸URLを安全な外部リンクへ自動変換表示'] },
  { version: 'v1.13.0', date: '2026-11-18', title: '日記編集保存の高速化・非同期Doc同期', items: ['Googleドキュメント同期を非同期切り離し＆シート1行一括書き込み化し、保存レスポンスを2秒以内へ高速化', '非同期Doc同期失敗時の右下エラー通知トースト＆再試行ボタンを実装'] },
  { version: 'v1.12.0', date: '2026-11-18', title: '初期表示タブの日記変更・カード整理', items: ['起動時の初期表示タブを「日記」に変更', '日記カードの日付（曜日付き）・タイトル表示レイアウトを整理'] },
  { version: 'v1.11.0', date: '2026-11-18', title: '楽観的更新＆差分同期による高速化', items: ['保存・更新時の全件再取得を廃止し、楽観的更新（エラー時ロールバック付き）を導入', '場所・食事のみの変更時はGoogleドキュメント同期をスキップする差分同期に対応'] },
  { version: 'v1.10.0', date: '2026-11-18', title: '場所検索の過去履歴サジェスト＆国土地理院API対応', items: ['場所キーワード検索時に過去の場所履歴を候補としてワンタップ選択可能に改善', 'Nominatimエラー時・駅名検索時の国土地理院API自動フォールバックを追加'] },
  { version: 'v1.9.0', date: '2026-11-18', title: '食事写真の日記一本化＆栄養項目拡張', items: ['食事写真の管理を日記DBへ一本化し、日付キーによる日記・食事間の相互リンクを実装', '食事記録DBへ塩分(g)・糖質(g)・食物繊維(g)を追加し、食事単位セット表示・日次集計に対応'] },
  { version: 'v1.4.0', date: '2026-11-18', title: '複数位置情報バッジ＆食事栄養分析', items: ['日記の複数地点📍バッジ・Googleマップ経路リンク表示に対応', '食事ログからの推定カロリー・PFC栄養分析および日別/週間サマリーを実装'] },
  { version: 'v1.3.0', date: '2026-11-18', title: 'アプリ内全項目編集＆周辺スポット選択', items: ['日記・鑑賞記録の全項目をアプリ内モーダルから編集・保存可能化', '現在地周辺スポットリスト選択および場所検索機能を実装'] },
  { version: 'v1.1.0', date: '2026-11-18', title: 'PWAアイコン＆写真サムネイル軽量配信', items: ['ホーム画面追加用のPWAアイコン設定および写真サムネイルのBase64軽量配信・キャッシュを実装'] },
  { version: 'v1.0.0', date: '2026-11-18', title: '初期リリース', items: ['日記DB・鑑賞記録DB統合ライフログ・ダッシュボード構築およびGitHub Pages独立公開'] }
];


const PROD_GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxLecFd_9FWeR-2w2ThU5SYS7es-0IVKODoLWYgDJGfsoiQzsSRF9IFMAhtZTPl17CDKw/exec';

function resolveGasApiUrl() {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const sp = new URLSearchParams(window.location.search);
      const override = (sp.get('gasUrl') || '').trim();
      if (override && override.startsWith('https://script.google.com/macros/s/')) {
        return override;
      }
    }
  } catch { /* ignore */ }
  return PROD_GAS_API_URL;
}

const GAS_API_URL = resolveGasApiUrl();

let watchData = [];
let diaryData = [];
let mealData = [];
let editingWatch = null;
let editingDiary = null;
let editingMeal = null;
let diaryLocations = [];
let removedPhotoUrls = new Set();
let diaryDisplayLimit = 80;
let statusFilter = '進行中';
let catFilter = 'ALL';
let platFilter = 'ALL';


let diaryTotalCount = 0;
let diaryFilteredCount = 0;
let diaryHasMore = false;
let diaryPeriodFilter = ''; // '' | 'YYYY' | 'YYYY-MM'
let diaryYearCounts = [];
let serverLocationHistory = [];

let watchTotalCount = 0;
let watchFilteredCount = 0;
let watchHasMore = false;
let watchDisplayLimit = 50;
let watchPeriodFilter = ''; // '' | 'YYYY' | 'YYYY-MM'
let watchYearCounts = [];
let watchSearchActive = false;
let watchStatusBeforeSearch = null;
let watchLastSearchQuery = '';
let serverWatchCastTags = [];
let serverWatchStaffTags = [];


let crossSearchState = {
  active: false,
  query: '',
  diaryCount: 0,
  watchCount: 0,
  diary: [],
  watch: [],
  scrollTop: 0,
  visitedKeys: new Set(),
  lastVisitedKey: '',
};


let activeInlineEdit = null;
let activeDetailView = null; // { type: 'diary' | 'watch', row: number, id: string, scrollY: number }
let inlineDiaryLocations = [];
let inlineDiaryOrigCoords = new Map();
let watchCastChips = [];
let watchStaffChips = [];
let watchEditSnapshot = null;
let diaryEditSnapshot = null;


const MEAL_ORDER = { '朝食': 1, '昼食': 2, '夕食': 3, '間食': 4 };

