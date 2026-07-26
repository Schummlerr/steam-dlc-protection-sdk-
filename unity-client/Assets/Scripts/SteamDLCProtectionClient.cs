using System;
using System.Collections;
using System.Security.Cryptography;
using System.Text;
using Steamworks;
using UnityEngine;
using UnityEngine.Networking;

using Org.BouncyCastle.Crypto.Agreement;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Security;

[Serializable]
public class DlcVerifyRequest
{
    public uint steamAppId;
    public uint dlcId;
    public string ticketHex;
    public string identity;
    public string clientPublicKey;
    public bool requestOfflineToken;
}

[Serializable]
public class WrappedKeyPayload
{
    public string serverPublicKey;
    public string iv;
    public string ciphertext;
    public string mac;
}

[Serializable]
public class DlcVerifyResponse
{
    public bool success;
    public string steamId;
    public string error;
    public WrappedKeyPayload wrappedKey;
    public string offlineToken;
    public int offlineTokenExpiresInHours;
}

[Serializable]
public class OfflineVerifyRequest
{
    public string token;
    public string clientPublicKey;
    public uint dlcId;
}

public class SteamDLCProtectionClient : MonoBehaviour
{
    private const string TicketIdentity = "dlc-protection-sdk-v1";

    [Header("Backend")]
    [SerializeField] private string verifyEndpointUrl = "http://localhost:3000/verify-dlc";
    [SerializeField] private string offlineVerifyEndpointUrl = "http://localhost:3000/verify-offline-token";
    [SerializeField] private string apiKey = "sk_test_dlc_protection_demo_key_2026";

    [Header("Game")]
    [SerializeField] private uint steamAppId = 480;
    [SerializeField] private uint targetDlcId = 123456;

    [Header("Offline Support")]
    [SerializeField] private bool enableOfflineCache = true;
    private const string OfflineTokenPrefKey = "DLC_OfflineToken";
    private const string OfflineTokenExpiryPrefKey = "DLC_OfflineTokenExpiry";

    private Callback<GetTicketForWebApiResponse_t> _ticketCallback;
    private HAuthTicket _pendingTicketHandle = HAuthTicket.Invalid;
    private Action<byte[]> _onTicketReady;
    private Action<string> _onTicketError;

    private void Awake()
    {
        if (!SteamAPI.Init())
        {
            Debug.LogError("[DLCProtection] SteamAPI.Init() failed.");
            enabled = false;
            return;
        }

        _ticketCallback = Callback<GetTicketForWebApiResponse_t>.Create(OnTicketForWebApiResponse);
    }

    private void Update()
    {
        SteamAPI.RunCallbacks();
    }

    private void OnDestroy()
    {
        if (_pendingTicketHandle != HAuthTicket.Invalid)
        {
            SteamUser.CancelAuthTicket(_pendingTicketHandle);
            _pendingTicketHandle = HAuthTicket.Invalid;
        }
        SteamAPI.Shutdown();
    }

    public void RequestDlcAccess(Action<byte[]> onAesKeyReady, Action<string> onError)
    {
        StartCoroutine(RequestDlcAccessCoroutine(onAesKeyReady, onError));
    }

    private IEnumerator RequestDlcAccessCoroutine(Action<byte[]> onAesKeyReady, Action<string> onError)
    {
        // Step 1: Check for cached offline token
        if (enableOfflineCache && HasValidOfflineToken())
        {
            string token = PlayerPrefs.GetString(OfflineTokenPrefKey, "");
            Debug.Log("[DLCProtection] Valid offline token found, verifying...");

            var clientKeyPair = GenerateEcKeyPair();
            byte[] clientPublicKey = GetPublicKeyBytes(clientKeyPair.Public);

            var requestBody = new OfflineVerifyRequest
            {
                token = token,
                clientPublicKey = Convert.ToBase64String(clientPublicKey),
                dlcId = targetDlcId,
            };

            string json = JsonUtility.ToJson(requestBody);
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);

            using (UnityWebRequest www = new UnityWebRequest(offlineVerifyEndpointUrl, "POST"))
            {
                www.uploadHandler = new UploadHandlerRaw(bodyRaw);
                www.downloadHandler = new DownloadHandlerBuffer();
                www.SetRequestHeader("Content-Type", "application/json");
                www.SetRequestHeader("Accept", "application/json");
                www.SetRequestHeader("X-Api-Key", apiKey);

                www.timeout = 10;
                yield return www.SendWebRequest();

                if (www.result == UnityWebRequest.Result.Success)
                {
                    DlcVerifyResponse response = JsonUtility.FromJson<DlcVerifyResponse>(www.downloadHandler.text);
                    if (response != null && response.success && response.wrappedKey != null)
                    {
                        try
                        {
                            byte[] aesKey = UnwrapAesKey(clientKeyPair.Private, response.wrappedKey);
                            Debug.Log("[DLCProtection] Offline token verified, DLC accessible.");
                            onAesKeyReady?.Invoke(aesKey);
                            yield break;
                        }
                        catch (Exception ex)
                        {
                            Debug.LogWarning($"[DLCProtection] Offline token unwrap failed: {ex.Message}");
                            // Fall through to online verification
                        }
                    }
                }
                else
                {
                    Debug.LogWarning($"[DLCProtection] Offline verification failed: {www.error}");
                    // Fall through to online verification
                }
            }
        }

        // Step 2: Online verification (with optional offline token request)
        byte[] ticketBytes = null;
        string ticketError = null;
        bool ticketDone = false;

        RequestWebApiTicket(
            bytes => { ticketBytes = bytes; ticketDone = true; },
            err => { ticketError = err; ticketDone = true; }
        );

        while (!ticketDone)
            yield return null;

        if (ticketBytes == null || ticketBytes.Length == 0)
        {
            onError?.Invoke(ticketError ?? "Empty Steam ticket.");
            yield break;
        }

        var clientKeyPairOnline = GenerateEcKeyPair();
        byte[] clientPublicKeyOnline = GetPublicKeyBytes(clientKeyPairOnline.Public);
        string ticketHex = BytesToHex(ticketBytes);

        var requestBodyOnline = new DlcVerifyRequest
        {
            steamAppId = steamAppId,
            dlcId = targetDlcId,
            ticketHex = ticketHex,
            identity = TicketIdentity,
            clientPublicKey = Convert.ToBase64String(clientPublicKeyOnline),
            requestOfflineToken = enableOfflineCache,  // Request token for offline use
        };

        string jsonOnline = JsonUtility.ToJson(requestBodyOnline);
        byte[] bodyRawOnline = Encoding.UTF8.GetBytes(jsonOnline);

        using (UnityWebRequest www = new UnityWebRequest(verifyEndpointUrl, "POST"))
        {
            www.uploadHandler = new UploadHandlerRaw(bodyRawOnline);
            www.downloadHandler = new DownloadHandlerBuffer();
            www.SetRequestHeader("Content-Type", "application/json");
            www.SetRequestHeader("Accept", "application/json");
            www.SetRequestHeader("X-Api-Key", apiKey);

            www.timeout = 15;
            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke($"HTTP error: {www.error} | Body: {www.downloadHandler.text}");
                yield break;
            }

            DlcVerifyResponse response = JsonUtility.FromJson<DlcVerifyResponse>(www.downloadHandler.text);

            if (response == null || !response.success || response.wrappedKey == null)
            {
                onError?.Invoke(response?.error ?? "Backend rejected request.");
                yield break;
            }

            // Cache offline token if provided
            if (!string.IsNullOrEmpty(response.offlineToken))
            {
                PlayerPrefs.SetString(OfflineTokenPrefKey, response.offlineToken);
                PlayerPrefs.SetString(OfflineTokenExpiryPrefKey, 
                    DateTime.UtcNow.AddHours(response.offlineTokenExpiresInHours).ToString("o"));
                PlayerPrefs.Save();
                Debug.Log($"[DLCProtection] Offline token cached ({response.offlineTokenExpiresInHours}h TTL)");
            }

            byte[] aesKey;
            try
            {
                aesKey = UnwrapAesKey(clientKeyPairOnline.Private, response.wrappedKey);
            }
            catch (Exception ex)
            {
                onError?.Invoke($"Key unwrap failed: {ex.Message}");
                yield break;
            }

            Debug.Log($"[DLCProtection] Access granted for SteamID {response.steamId}");
            onAesKeyReady?.Invoke(aesKey);
        }
    }

    private bool HasValidOfflineToken()
    {
        string expiryStr = PlayerPrefs.GetString(OfflineTokenExpiryPrefKey, "");
        if (string.IsNullOrEmpty(expiryStr)) return false;

        if (DateTime.TryParse(expiryStr, out DateTime expiry))
        {
            return DateTime.UtcNow < expiry;
        }
        return false;
    }

    private void RequestWebApiTicket(Action<byte[]> onReady, Action<string> onError)
    {
        _onTicketReady = onReady;
        _onTicketError = onError;

        if (_pendingTicketHandle != HAuthTicket.Invalid)
        {
            SteamUser.CancelAuthTicket(_pendingTicketHandle);
            _pendingTicketHandle = HAuthTicket.Invalid;
        }

        _pendingTicketHandle = SteamUser.GetAuthTicketForWebApi(TicketIdentity);
        if (_pendingTicketHandle == HAuthTicket.Invalid)
        {
            onError?.Invoke("GetAuthTicketForWebApi() returned invalid handle.");
            return;
        }

        StartCoroutine(TicketTimeoutCoroutine(15f));
    }

    private IEnumerator TicketTimeoutCoroutine(float seconds)
    {
        yield return new WaitForSeconds(seconds);
        if (_onTicketReady != null)
        {
            _onTicketError?.Invoke("Steam ticket timeout.");
            _onTicketReady = null;
            _onTicketError = null;
        }
    }

    private void OnTicketForWebApiResponse(GetTicketForWebApiResponse_t callback)
    {
        if (_onTicketReady == null)
            return;

        if (callback.m_eResult != EResult.k_EResultOK)
        {
            _onTicketError?.Invoke($"Steam ticket error: {callback.m_eResult}");
            _onTicketReady = null;
            _onTicketError = null;
            return;
        }

        byte[] ticket = callback.m_rgubTicket;
        if (ticket == null || ticket.Length == 0 || callback.m_cubTicket <= 0)
        {
            _onTicketError?.Invoke("Steam returned empty ticket.");
            _onTicketReady = null;
            _onTicketError = null;
            return;
        }

        if (callback.m_cubTicket < ticket.Length)
        {
            byte[] trimmed = new byte[callback.m_cubTicket];
            Buffer.BlockCopy(ticket, 0, trimmed, 0, callback.m_cubTicket);
            ticket = trimmed;
        }

        _onTicketReady?.Invoke(ticket);
        _onTicketReady = null;
        _onTicketError = null;
    }

    public byte[] DecryptDlcAssetBundle(byte[] encryptedBundle, byte[] aesKey)
    {
        if (encryptedBundle == null || encryptedBundle.Length < 48)
            throw new ArgumentException("Encrypted bundle too short (expected: iv(16) + hmac(32) + ciphertext).");

        byte[] iv = new byte[16];
        byte[] mac = new byte[32];
        Buffer.BlockCopy(encryptedBundle, 0, iv, 0, 16);
        Buffer.BlockCopy(encryptedBundle, 16, mac, 0, 32);

        int cipherLen = encryptedBundle.Length - 48;
        byte[] ciphertext = new byte[cipherLen];
        Buffer.BlockCopy(encryptedBundle, 48, ciphertext, 0, cipherLen);

        byte[] computedMac = ComputeHmacSha256(aesKey, Concat(iv, ciphertext));
        if (!FixedTimeEquals(mac, computedMac))
            throw new CryptographicException("HMAC check failed — bundle tampered or wrong key.");

        using (Aes aes = Aes.Create())
        {
            aes.KeySize = 256;
            aes.Key = aesKey;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.IV = iv;

            using (ICryptoTransform decryptor = aes.CreateDecryptor())
            {
                return decryptor.TransformFinalBlock(ciphertext, 0, ciphertext.Length);
            }
        }
    }

    private static byte[] UnwrapAesKey(
        Org.BouncyCastle.Crypto.AsymmetricKeyParameter clientPrivateKey,
        WrappedKeyPayload wrapped)
    {
        byte[] serverPublicKeyBytes = Convert.FromBase64String(wrapped.serverPublicKey);
        byte[] iv = Convert.FromBase64String(wrapped.iv);
        byte[] ciphertext = Convert.FromBase64String(wrapped.ciphertext);
        byte[] mac = Convert.FromBase64String(wrapped.mac);

        var serverPublicKey = (ECPublicKeyParameters)
            PublicKeyFactory.CreateKey(serverPublicKeyBytes);

        var agreement = new ECDHBasicAgreement();
        agreement.Init(clientPrivateKey);

        var sharedSecret = agreement.CalculateAgreement(serverPublicKey);
        byte[] rawSecret = sharedSecret.ToByteArrayUnsigned();
        byte[] transportKey = DeriveTransportKey(rawSecret);

        byte[] expectedMac = ComputeHmacSha256(transportKey, Concat(iv, ciphertext));
        if (!FixedTimeEquals(mac, expectedMac))
            throw new CryptographicException("Wrapped key HMAC invalid.");

        using (Aes aes = Aes.Create())
        {
            aes.KeySize = 256;
            aes.Key = transportKey;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.IV = iv;

            using (ICryptoTransform decryptor = aes.CreateDecryptor())
            {
                return decryptor.TransformFinalBlock(ciphertext, 0, ciphertext.Length);
            }
        }
    }

    private static byte[] DeriveTransportKey(byte[] sharedSecret)
    {
        using (HMACSHA256 hmac = new HMACSHA256(Encoding.UTF8.GetBytes("dlc-protection-sdk-v1-transport")))
        {
            return hmac.ComputeHash(sharedSecret);
        }
    }

    private static byte[] ComputeHmacSha256(byte[] key, byte[] data)
    {
        using (HMACSHA256 hmac = new HMACSHA256(key))
            return hmac.ComputeHash(data);
    }

    private static byte[] Concat(byte[] a, byte[] b)
    {
        byte[] result = new byte[a.Length + b.Length];
        Buffer.BlockCopy(a, 0, result, 0, a.Length);
        Buffer.BlockCopy(b, 0, result, a.Length, b.Length);
        return result;
    }

    private static bool FixedTimeEquals(byte[] a, byte[] b)
    {
        if (a == null || b == null || a.Length != b.Length)
            return false;

        int diff = 0;
        for (int i = 0; i < a.Length; i++)
            diff |= a[i] ^ b[i];
        return diff == 0;
    }

    private static Org.BouncyCastle.Crypto.AsymmetricCipherKeyPair GenerateEcKeyPair()
    {
        var random = new SecureRandom();
        var ecKeyGen = new Org.BouncyCastle.Crypto.Generators.ECKeyPairGenerator();
        var oid = Org.BouncyCastle.Asn1.Sec.SecNamedCurves.GetOid("secp256r1");
        var ecParams = Org.BouncyCastle.Asn1.Sec.SecNamedCurves.GetByOid(oid);

        var domainParams = new ECNamedDomainParameters(
            oid, ecParams.Curve, ecParams.G, ecParams.N, ecParams.H, ecParams.GetSeed());

        var keyGenParams = new ECKeyGenerationParameters(domainParams, random);
        ecKeyGen.Init(keyGenParams);
        return ecKeyGen.GenerateKeyPair();
    }

    private static byte[] GetPublicKeyBytes(Org.BouncyCastle.Crypto.AsymmetricKeyParameter publicKey)
    {
        var ecPub = (ECPublicKeyParameters)publicKey;
        byte[] q = ecPub.Q.GetEncoded(false);

        byte[] header = new byte[] {
            0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
            0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00
        };

        byte[] spki = new byte[header.Length + q.Length];
        Buffer.BlockCopy(header, 0, spki, 0, header.Length);
        Buffer.BlockCopy(q, 0, spki, header.Length, q.Length);
        return spki;
    }

    private static string BytesToHex(byte[] bytes)
    {
        StringBuilder sb = new StringBuilder(bytes.Length * 2);
        for (int i = 0; i < bytes.Length; i++)
            sb.Append(bytes[i].ToString("x2"));
        return sb.ToString();
    }
}