import React, {useEffect, useRef, useState} from 'react';
import {FlatList, NativeEventEmitter, NativeModules, SafeAreaView, Text, TouchableOpacity, View} from 'react-native';
import bleUtils from './utils/bleUtils';

import BleManager from 'react-native-ble-manager';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

type Device = {
  name: string;
  id: string;
  advertising: any;
  rssi: number;
};

function App(): JSX.Element {
  const terminalSessionIdRef = useRef<any>(0);

  const devicesRef = useRef<Record<string, Device>>({});

  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      setDevices(Object.values(devicesRef.current));
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    initBle();
  }, []);

  const initBle = async () => {
    await bleUtils.askBlPermissions();

    await BleManager.start({showAlert: true})
      .then(() => true)
      .catch(() => {
        console.log('Cannot start bluetooth');
      });

    bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', handleBleManagerDiscoverPeripheral);
    bleManagerEmitter.addListener('BleManagerStopScan', handleBleManagerStopScan);
    bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', handleBleManagerDisconnectPeripheral);
    bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', handleBleManagerDidUpdateValueForCharacteristic);

    setTimeout(async () => {
      await BleManager.scan([], 0, true);
    }, 2000);
  };

  const handleBleManagerStopScan = () => {};
  const handleBleManagerDisconnectPeripheral = () => {};

  const handleBleManagerDidUpdateValueForCharacteristic = (data: {peripheral: string; value: number[]; service: string}) => {
    console.log('🚀 ~ file: App.tsx:64 ~ handleBleManagerDidUpdateValueForCharacteristic ~ data:', data);
    const {iv, authType, isValid} = bleUtils.checkTerminalResponse(data.value);

    if (isValid) {
      if (authType[0] === '01') {
        generateAuth(iv);
      }
    }
  };

  const handleBleManagerDiscoverPeripheral = (peripheral: {name: string; id: string; advertising: any; rssi: number}) => {
    if (peripheral.name?.startsWith('AB21')) {
      devicesRef.current[peripheral.id] = peripheral;
    }
  };

  const generateSession = async () => {
    await BleManager.connect('b37eac53-b4e6-af35-f065-74c169fe59f9');

    await BleManager.retrieveServices('b37eac53-b4e6-af35-f065-74c169fe59f9').then(async () => {
      await BleManager.startNotification('b37eac53-b4e6-af35-f065-74c169fe59f9', '8f0987bd-8bde-46ad-8443-3356cc56d831', 'ec01').then(async () => {
        const {payload, sessionId} = bleUtils.generateTerminalSessionPayload();

        terminalSessionIdRef.current = sessionId;

        await BleManager.write('b37eac53-b4e6-af35-f065-74c169fe59f9', '8f0987bd-8bde-46ad-8443-3356cc56d831', 'ec01', payload);
      });
    });
  };

  const generateAuth = async (iv: string) => {
    const deviceId = '8f0987bd-8bde-46ad-8443-3356cc56d831';
    const deviceSecretKey = 'b1faded673ad9e9958e71192140c063ac206d6664c4fbf3edaa0edc46e417ee7';

    const {payload} = bleUtils.generateTerminalAuthPayload({
      deviceId,
      deviceSecretKey,
      iv,
      sessionId: terminalSessionIdRef.current,
    });

    await BleManager.write('b37eac53-b4e6-af35-f065-74c169fe59f9', '8f0987bd-8bde-46ad-8443-3356cc56d831', 'ec01', payload);
  };

  return (
    <SafeAreaView>
      <View style={{padding: 20}}>
        <Text>Devices</Text>
        <FlatList
          data={devices}
          renderItem={({item}) => {
            return (
              <TouchableOpacity
                onPress={() => generateSession()}
                style={{
                  marginTop: 10,
                  backgroundColor: '#f2f2f2',
                  borderBottomWidth: 1,
                  padding: 8,
                }}>
                <Text>{item.name}</Text>
                <Text>{item.rssi}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

export default App;
