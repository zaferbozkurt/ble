import {Platform} from 'react-native';
import {PERMISSIONS, RESULTS, check, request} from 'react-native-permissions';
import {crc16} from './crc16';
import {Buffer} from '@craftzdog/react-native-buffer';
import Crypto from 'react-native-quick-crypto';

const askBlPermissions = async () => {
  try {
    if (Platform.OS === 'ios') {
      const checkPermission = await check(PERMISSIONS.IOS.BLUETOOTH_PERIPHERAL);
      if (checkPermission === RESULTS.DENIED) {
        await request(PERMISSIONS.IOS.BLUETOOTH_PERIPHERAL);
      }
    } else {
      const checkPermission = await check(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
      if (checkPermission === RESULTS.DENIED) {
        await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
      }
    }
    return true;
  } catch {
    return false;
  }
};

const getBytesFromUint32 = (el: number) => {
  let arr = [];

  arr[0] = (el & 0xff000000) >> 24;
  arr[1] = (el & 0x00ff0000) >> 16;
  arr[2] = (el & 0x0000ff00) >> 8;
  arr[3] = el & 0x000000ff;

  return arr;
};

const decimalToHex = (d: number): string => {
  var hex = Number(d).toString(16);

  if (hex.length < 2) {
    hex = '0' + hex;
  }

  return hex.toString();
};

const decimalToHexReponse = (response: number[]) => {
  const newResponse = [];
  for (var i = 0; i < response.length; i++) {
    newResponse[i] = decimalToHex(response[i]);
  }
  return newResponse;
};

const generateTerminalSessionPayload = () => {
  const header = [0x53];
  const sessionId = (new Date().getTime() / 1000).toFixed(0);
  const sessionIdHex = getBytesFromUint32(Number(sessionId));

  let payload = [...header];

  payload = payload.concat([1 + sessionId.length, 0x00]);
  payload = payload.concat([0x01, 0x01]);
  payload = payload.concat(sessionIdHex);

  let crc = crc16(payload);
  let crcArr: number[] = getBytesFromUint32(crc).filter(x => x);
  crcArr = crcArr.reverse();

  payload = payload.concat(crcArr);
  console.log('🚀 ~ file: bleUtils.ts:71 ~ generateTerminalSessionPayload ~ payload:', payload);
  console.log('🚀 ~ file: bleUtils.ts:72 ~ generateTerminalSessionPayload ~ payloadhex:', decimalToHexReponse(payload));

  return {payload, sessionId};
};

const checkTerminalResponse = (data: number[]) => {
  console.log('🚀 ~ file: bleUtils.ts:78 ~ checkTerminalResponse ~ data:', data);
  const data16 = decimalToHexReponse(data);
  console.log('🚀 ~ file: bleUtils.ts:80 ~ checkTerminalResponse ~ data16:', data16);

  const data16Reverse = [...data16].reverse();
  const receivedCRC = data16Reverse[0].toString() + data16Reverse[1].toString();

  const calculatedCRC = crc16(data.splice(0, data.length - 2)).toString(16);

  const isValid = receivedCRC === calculatedCRC;
  console.log('🚀 ~ file: bleUtils.ts:88 ~ checkTerminalResponse ~ isValid:', isValid);
  if (isValid) {
    const header = data16.splice(0, 1);
    console.log('🚀 ~ file: bleUtils.ts:84 ~ checkTerminalResponse ~ header:', header);
    const length = data16.splice(0, 2);
    console.log('🚀 ~ file: bleUtils.ts:86 ~ checkTerminalResponse ~ length:', length);
    const subFunction = data16.splice(0, 1);
    console.log('🚀 ~ file: bleUtils.ts:88 ~ checkTerminalResponse ~ subFunction:', subFunction);
    const functionRes = data16.splice(0, 1);
    console.log('🚀 ~ file: bleUtils.ts:90 ~ checkTerminalResponse ~ functionRes:', functionRes);
    const result = data16.splice(0, 2);
    console.log('🚀 ~ file: bleUtils.ts:92 ~ checkTerminalResponse ~ result:', result);
    const resData = data16.splice(0, data16.length - 2);
    console.log('🚀 ~ file: bleUtils.ts:94 ~ checkTerminalResponse ~ resData:', resData);
    const resCrc = [...data16];
    console.log('🚀 ~ file: bleUtils.ts:96 ~ checkTerminalResponse ~ resCrc:', resCrc);

    const authType = resData.splice(0, 1);
    console.log('🚀 ~ file: bleUtils.ts:99 ~ checkTerminalResponse ~ authType:', authType);
    const iv = resData.splice(0, 16);
    console.log('🚀 ~ file: bleUtils.ts:101 ~ checkTerminalResponse ~ iv:', iv);
    const challenge = resData.splice(0, 32);
    console.log('🚀 ~ file: bleUtils.ts:103 ~ checkTerminalResponse ~ challenge:', challenge);

    return {isValid: true, iv: iv.join(''), authType, challenge};
  }

  return {isValid: false, iv: '', authType: '', challenge: ''};
};

const encryptVBIVSessionIdWithSharedSecret = (deviceId: string, sharedSecret: string, iv: string, sessionId: string) => {
  console.log('🚀 ~ file: bleUtils.ts:116 ~ encryptVBIVSessionIdWithSharedSecret ~ sessionId:', sessionId);
  console.log('🚀 ~ file: bleUtils.ts:116 ~ encryptVBIVSessionIdWithSharedSecret ~ iv:', iv);

  const deviceIdWithoutHyphens = deviceId.split('-').join('');
  const sessionIdWithoutHyphens = sessionId.split('-').join('');
  const cipher = Crypto.createCipheriv('aes-256-cbc', Buffer.from(sharedSecret, 'hex'), Buffer.from(iv, 'hex'));
  const encrypted = cipher.update(Buffer.from(sessionIdWithoutHyphens + deviceIdWithoutHyphens, 'hex'));

  const encryptedArr = encrypted.toString().split(',');

  return encryptedArr;
};

const generateTerminalAuthPayload = ({deviceId, deviceSecretKey, iv, sessionId}: {deviceId: string; deviceSecretKey: string; iv: string; sessionId: string}) => {
  const sessionIdHex = getBytesFromUint32(Number(sessionId));

  const signatureArr = encryptVBIVSessionIdWithSharedSecret(deviceId, deviceSecretKey, iv, `${sessionIdHex.map(x => x.toString(16)).join('')}000000000000000000000000`);

  console.log('🚀 ~ file: bleUtils.ts:137 ~ generateTerminalAuthPayload ~ signatureArr:', signatureArr);
  console.log('🚀 ~ file: bleUtils.ts:137 ~ generateTerminalAuthPayload ~ signatureArrHex:', decimalToHexReponse(signatureArr.map(x => Number(x))));

  const header = [0x53];

  let payload = [...header];

  payload = payload.concat([0x2b, 0x00]);
  payload = payload.concat([0x02, 0x01]);
  payload = payload.concat(sessionIdHex);
  payload = payload.concat(signatureArr.map(x => Number(x)));

  let crc = crc16(payload);
  let crcArr: number[] = getBytesFromUint32(crc).filter(x => x);
  crcArr = crcArr.reverse();

  payload = payload.concat(crcArr);
  console.log('🚀 ~ file: bleUtils.ts:150 ~ generateTerminalAuthPayload ~ payload:', payload);
  console.log('🚀 ~ file: bleUtils.ts:151 ~ generateTerminalAuthPayload ~ payload hex:', decimalToHexReponse(payload));

  return {payload};
};

export default {
  askBlPermissions,
  generateTerminalSessionPayload,
  checkTerminalResponse,
  generateTerminalAuthPayload,
};
