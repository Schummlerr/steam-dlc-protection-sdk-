using UnityEngine;

public class DlcLoaderExample : MonoBehaviour
{
    [SerializeField] private SteamDLCProtectionClient protectionClient;
    [SerializeField] private TextAsset encryptedDlcBundleFile;

    private void Start()
    {
        Debug.Log($"[DlcLoader] Running on object: {gameObject.name}");
        Debug.Log($"[DlcLoader] protectionClient = {protectionClient}");
        Debug.Log($"[DlcLoader] encryptedDlcBundleFile assigned = {encryptedDlcBundleFile != null}");

        if (encryptedDlcBundleFile == null)
        {
            Debug.LogError("[DlcLoader] Kein real-dlc.bytes TextAsset zugewiesen!");
            return;
        }

        Debug.Log($"[DlcLoader] Encrypted size = {encryptedDlcBundleFile.bytes.Length}");

        protectionClient.RequestDlcAccess(
            aesKey =>
            {
                byte[] decrypted = protectionClient.DecryptDlcAssetBundle(
                    encryptedDlcBundleFile.bytes, aesKey);

                AssetBundle bundle = AssetBundle.LoadFromMemory(decrypted);
                if (bundle == null)
                {
                    Debug.LogError("[DlcLoader] Fehler: AssetBundle konnte nicht aus dem entschlüsselten Speicher geladen werden!");
                    return;
                }

                Debug.Log($"[DlcLoader] DLC-AssetBundle geladen: {bundle.name}");

                // Versuche das Cube-Prefab zu laden und in der Szene zu instanziieren
                GameObject prefab = bundle.LoadAsset<GameObject>("Cube");
                if (prefab != null)
                {
                    Instantiate(prefab);
                    Debug.Log("[DlcLoader] Cube erfolgreich aus dem DLC instanziiert!");
                }
                else
                {
                    Debug.LogWarning("[DlcLoader] Konnte 'Cube' im AssetBundle nicht finden.");
                }
            },
            error => Debug.LogError($"[DlcLoader] {error}")
        );
    }
}
