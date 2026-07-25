using UnityEditor;
using System.IO;
using UnityEngine;

public class BuildAssetBundles
{
    [MenuItem("Assets/Build AssetBundles")]
    static void BuildAllAssetBundles()
    {
        string assetBundleDirectory = "Assets/BuiltAssetBundles";
        if (!Directory.Exists(assetBundleDirectory))
        {
            Directory.CreateDirectory(assetBundleDirectory);
        }

        // Build for StandaloneWindows64 (can be changed to EditorUserBuildSettings.activeBuildTarget)
        BuildPipeline.BuildAssetBundles(assetBundleDirectory, 
                                        BuildAssetBundleOptions.None, 
                                        BuildTarget.StandaloneWindows64);
                                        
        Debug.Log($"[BuildAssetBundles] AssetBundles erfolgreich in {assetBundleDirectory} gebaut.");
    }
}
