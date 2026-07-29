import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Button,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CITIES, cityById, type City, type CityId } from './src/core/cities';
import { formatWan } from './src/core/formatMoney';
import { syncCityDataIfNeeded, CityDataNotPublishedError } from './src/device/dataSync';
import { readSelectedCityId, writeSelectedCityId } from './src/device/selectedCity';
import { getTransactionQueryService } from './src/device/queryEngine';
import type { TransactionCard, ValidTransaction } from './src/device/queryEngine';

type SyncState =
  | { status: 'loading' }
  | { status: 'syncing'; message: string; ratio?: number }
  | { status: 'ready' }
  | { status: 'error'; message: string; retryable: boolean };

export default function App() {
  const [cityId, setCityId] = useState<CityId | null>(null);
  const [sync, setSync] = useState<SyncState>({ status: 'loading' });
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<TransactionCard | null>(null);

  /**
   * Switching city mid-sync starts a second one, so every callback checks
   * it's still the current run before touching state — otherwise the
   * abandoned city's progress keeps overwriting the new one's, and its
   * completion would unlock a UI pointed at data it never downloaded.
   */
  const runId = useRef(0);

  const startSync = useCallback(async (city: City) => {
    const thisRun = ++runId.current;
    const isCurrent = () => runId.current === thisRun;

    setSync({ status: 'syncing', message: '準備中...' });
    try {
      const result = await syncCityDataIfNeeded(city, ({ message, ratio }) => {
        if (isCurrent()) setSync({ status: 'syncing', message, ratio });
      });
      if (!isCurrent()) return;

      getTransactionQueryService(city.id, result.updated);
      setSync({ status: 'ready' });
    } catch (err) {
      if (!isCurrent()) return;
      // Nothing published for this city is a permanent state, not a
      // network blip — offering 重試 would just fail the same way.
      setSync(
        err instanceof CityDataNotPublishedError
          ? { status: 'error', message: `${city.displayName}的資料尚未發布，請先選擇其他縣市。`, retryable: false }
          : { status: 'error', message: `資料同步失敗，請確認網路連線後重試。\n(${String(err)})`, retryable: true },
      );
    }
  }, []);

  useEffect(() => {
    readSelectedCityId().then((saved) => {
      setCityId(saved);
      startSync(cityById(saved));
    });
  }, [startSync]);

  function handleSelectCity(next: CityId) {
    if (next === cityId) return;
    setCityId(next);
    setCard(null);
    setError(null);
    setAddress('');
    void writeSelectedCityId(next);
    void startSync(cityById(next));
  }

  async function handleQuery() {
    if (!cityId) return;
    setLoading(true);
    setError(null);
    setCard(null);
    try {
      setCard(await getTransactionQueryService(cityId).query(address));
    } catch (err) {
      setError(`查詢失敗：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const city = cityId ? cityById(cityId) : null;
  // A busy street runs to hundreds of transactions (臺灣大道三段 alone has
  // 547), so the results are the FlatList itself and the form is its
  // header — rendering them all eagerly inside a ScrollView would mount
  // thousands of views on every query.
  const transactions = card?.status === 'ok' ? card.transactions : EMPTY_TRANSACTIONS;

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>PropLens 物件查詢（POC）</Text>

      <Text style={styles.fieldLabel}>縣市</Text>
      <CityPicker selectedCityId={cityId} onSelect={handleSelectCity} />

      {sync.status !== 'ready' && <SyncStatusView sync={sync} onRetry={() => city && startSync(city)} />}

      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder={city ? `輸入${city.displayName}地址，例如 ${city.exampleAddress}` : '輸入地址'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={sync.status === 'ready'}
      />
      <Button
        title={loading ? '查詢中…' : '查詢'}
        onPress={handleQuery}
        disabled={loading || sync.status !== 'ready' || address.trim().length === 0}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {card && <ResultSummary card={card} />}
      <StatusBar style="auto" />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          data={transactions}
          keyExtractor={transactionKey}
          renderItem={({ item }) => <TransactionRow transaction={item} />}
          ListHeaderComponent={header}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          windowSize={5}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Stable identity so the list isn't rebuilt when nothing was found. */
const EMPTY_TRANSACTIONS: ValidTransaction[] = [];

/**
 * The same natural key the pipeline dedupes on, so two genuinely distinct
 * rows can't collide — 同一棟同日期同價格 of two different units would,
 * but the store already merges those into one row.
 */
function transactionKey(transaction: ValidTransaction): string {
  return `${transaction.address}|${transaction.transactionDate}|${transaction.price}`;
}

function CityPicker({
  selectedCityId,
  onSelect,
}: {
  selectedCityId: CityId | null;
  onSelect: (cityId: CityId) => void;
}) {
  return (
    <View style={styles.cityPicker}>
      {CITIES.map((city) => {
        const selected = city.id === selectedCityId;
        return (
          <Pressable
            key={city.id}
            onPress={() => onSelect(city.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.cityOption, selected && styles.cityOptionSelected]}
          >
            <Text style={[styles.cityOptionText, selected && styles.cityOptionTextSelected]}>{city.displayName}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SyncStatusView({ sync, onRetry }: { sync: Exclude<SyncState, { status: 'ready' }>; onRetry: () => void }) {
  if (sync.status === 'loading') {
    return (
      <View style={styles.syncRow}>
        <ActivityIndicator />
      </View>
    );
  }
  if (sync.status === 'syncing') {
    return (
      <View style={styles.syncBlock}>
        <View style={styles.syncRow}>
          <ActivityIndicator />
          <Text style={styles.syncText}>{sync.message}</Text>
        </View>
        {sync.ratio !== undefined && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(Math.min(sync.ratio, 1) * 100)}%` }]} />
          </View>
        )}
      </View>
    );
  }
  return (
    <View>
      <Text style={styles.error}>{sync.message}</Text>
      {sync.retryable && <Button title="重試" onPress={onRetry} />}
    </View>
  );
}

/** Everything above the transaction list — the list itself is the FlatList's data. */
function ResultSummary({ card }: { card: TransactionCard }) {
  if (card.status === 'address-not-recognized') {
    return <Text style={styles.error}>地址無法辨識，請確認有輸入到門牌號（例如「…路123號」）。</Text>;
  }
  if (card.status === 'no-transactions-on-street') {
    return <Text style={styles.error}>{card.street}目前沒有 2021/7 實價登錄2.0 之後的有效交易紀錄。</Text>;
  }

  return (
    <View style={styles.results}>
      <Text style={styles.resultsHeading}>
        {card.street}同路段有效交易　{card.count} 筆
      </Text>
      <Text style={styles.resultsNote}>以下皆為實價登錄公告的原始欄位，未經任何比較或估算。</Text>
    </View>
  );
}

function TransactionRow({ transaction }: { transaction: ValidTransaction }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardAddress}>{transaction.address}</Text>
      <Text style={styles.cardDate}>交易日期 {transaction.transactionDate}</Text>

      <View style={styles.fieldGrid}>
        <Field label="房屋類別" value={transaction.buildingType} />
        <Field label="交易類別" value={transaction.transactionSubject} />
        <Field label="主要用途" value={transaction.mainUse} />
        <Field label="建成年份" value={formatCompletionYear(transaction.completionDate)} />
        <Field label="坪數" value={formatPing(transaction.areaPing)} />
        <Field label="每坪單價" value={formatMoney(transaction.unitPricePerPing)} />
        <Field label="總價" value={formatMoney(transaction.price)} />
        <Field label="使用分區" value={transaction.urbanLandUse} />
      </View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <View style={styles.field}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value && value.length > 0 ? value : '不詳'}</Text>
    </View>
  );
}

/**
 * 實價登錄 gives the full 建築完成年月; the year is what identifies the
 * building's vintage, and showing the day would imply a precision the
 * field isn't used for.
 */
function formatCompletionYear(completionDate: string | undefined): string | undefined {
  return completionDate ? `${completionDate.slice(0, 4)} 年` : undefined;
}

function formatPing(areaPing: number | undefined): string | undefined {
  return areaPing === undefined ? undefined : `${areaPing.toFixed(2)} 坪`;
}

function formatMoney(amount: number | undefined): string | undefined {
  return amount === undefined ? undefined : formatWan(amount);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { padding: 20, gap: 12, paddingBottom: 40 },
  header: { gap: 12 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  fieldLabel: { fontSize: 12, color: '#666' },
  cityPicker: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cityOption: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  cityOptionSelected: { backgroundColor: '#007aff' },
  cityOptionText: { fontSize: 15, color: '#333' },
  cityOptionTextSelected: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: '#c0392b', marginTop: 12 },
  syncBlock: { marginBottom: 8, gap: 8 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncText: { fontSize: 13, color: '#666', flexShrink: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#e5e5e5', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#007aff' },
  results: { marginTop: 16, gap: 12 },
  resultsHeading: { fontSize: 16, fontWeight: '600' },
  resultsNote: { fontSize: 12, color: '#666' },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  cardAddress: { fontSize: 15, fontWeight: '600' },
  cardDate: { fontSize: 12, color: '#666', marginTop: 2 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  field: { width: '50%', paddingVertical: 6, paddingRight: 8 },
  cardLabel: { fontSize: 11, color: '#666' },
  cardValue: { fontSize: 15, fontWeight: '500', marginTop: 1 },
});
