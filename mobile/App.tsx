import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Button,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { syncDataIfNeeded } from './lib/dataSync';
import { getPropertyQueryService, enrichTransactions } from './lib/queryEngine';
import type { PropertyCard, SchoolDistrictFieldResult } from './lib/queryEngine';

type SyncState = { status: 'syncing'; message: string } | { status: 'ready' } | { status: 'error'; message: string };

export default function App() {
  const [sync, setSync] = useState<SyncState>({ status: 'syncing', message: '準備中...' });
  const [address, setAddress] = useState('台中市西屯區台灣大道三段99號');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<PropertyCard | null>(null);

  useEffect(() => {
    runSync();
  }, []);

  async function runSync() {
    setSync({ status: 'syncing', message: '準備中...' });
    try {
      const result = await syncDataIfNeeded((message) => setSync({ status: 'syncing', message }));
      getPropertyQueryService(result.updated);
      await enrichTransactions((done, total) => {
        if (total > 0) {
          setSync({ status: 'syncing', message: `分析交易資料中 (${done}/${total})...` });
        }
      });
      setSync({ status: 'ready' });
    } catch (err) {
      setSync({
        status: 'error',
        message: `資料同步失敗，請確認網路連線後重試。\n(${String(err)})`,
      });
    }
  }

  async function handleQuery() {
    setLoading(true);
    setError(null);
    setCard(null);
    try {
      const service = getPropertyQueryService();
      const result = await service.query(address);
      setCard(result);
    } catch (err) {
      setError(`查詢失敗：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>PropLens 物件查詢（POC）</Text>

          {sync.status !== 'ready' && <SyncStatusView sync={sync} onRetry={runSync} />}

          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="輸入台中市地址"
            autoCapitalize="none"
            autoCorrect={false}
            editable={sync.status === 'ready'}
          />
          <Button
            title={loading ? '查詢中…' : '查詢'}
            onPress={handleQuery}
            disabled={loading || sync.status !== 'ready'}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          {card && <PropertyCardView card={card} />}

          <StatusBar style="auto" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SyncStatusView({ sync, onRetry }: { sync: Exclude<SyncState, { status: 'ready' }>; onRetry: () => void }) {
  if (sync.status === 'syncing') {
    return (
      <View style={styles.syncRow}>
        <ActivityIndicator />
        <Text style={styles.syncText}>{sync.message}</Text>
      </View>
    );
  }
  return (
    <View>
      <Text style={styles.error}>{sync.message}</Text>
      <Button title="重試" onPress={onRetry} />
    </View>
  );
}

function PropertyCardView({ card }: { card: PropertyCard }) {
  if (card.status === 'address-not-recognized') {
    return <Text style={styles.error}>地址無法辨識，請確認輸入是否正確。</Text>;
  }
  if (card.status === 'outside-taichung') {
    return <Text style={styles.error}>此地址不在台中市範圍內，僅支援台中市。</Text>;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>都市計畫分區</Text>
      <Text style={styles.cardValue}>{card.zoneName}</Text>

      {card.status === 'ok' ? (
        <>
          <Text style={styles.cardLabel}>同分區有效交易均價</Text>
          <Text style={styles.cardValue}>{card.averagePrice.toLocaleString('zh-TW')} 元</Text>
          <Text style={styles.cardLabel}>樣本數</Text>
          <Text style={styles.cardValue}>{card.sampleCount} 筆</Text>
        </>
      ) : (
        <>
          <Text style={styles.warning}>樣本數不足（{card.sampleCount} 筆），改列原始交易紀錄：</Text>
          {card.transactions.map((t, i) => (
            <Text key={i} style={styles.transactionRow}>
              {t.transactionDate}｜{t.address}｜{t.price.toLocaleString('zh-TW')} 元
            </Text>
          ))}
        </>
      )}

      <Text style={styles.cardLabel}>國小學區</Text>
      <Text style={styles.cardValue}>{describeSchoolDistrict(card.elementarySchoolDistrict)}</Text>
      <Text style={styles.cardLabel}>國中學區</Text>
      <Text style={styles.cardValue}>{describeSchoolDistrict(card.juniorHighSchoolDistrict)}</Text>
    </View>
  );
}

function describeSchoolDistrict(result: SchoolDistrictFieldResult): string {
  switch (result.status) {
    case 'found':
      return result.schoolName;
    case 'needs-manual-review':
      return '無法自動判定，需人工確認';
    case 'address-not-in-registry':
      return '查無對應門牌資料';
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: '#c0392b', marginTop: 12 },
  warning: { color: '#b8860b', marginBottom: 8 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  syncText: { fontSize: 13, color: '#666' },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    gap: 4,
  },
  cardLabel: { fontSize: 12, color: '#666', marginTop: 8 },
  cardValue: { fontSize: 18, fontWeight: '600' },
  transactionRow: { fontSize: 13, marginTop: 4 },
});
