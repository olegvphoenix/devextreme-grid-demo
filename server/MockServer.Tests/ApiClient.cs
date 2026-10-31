using System.Text.Json;

namespace MockServer.Tests;

public static class ApiClient
{
    public static Task<HttpResponseMessage> PostForm(HttpClient client, string url, params (string, string)[] fields) =>
        client.PostAsync(url, new FormUrlEncodedContent(fields.Select(f => new KeyValuePair<string, string>(f.Item1, f.Item2))));

    public static async Task<JsonElement> Query(HttpClient client, params (string, string)[] fields)
    {
        var response = await PostForm(client, "/api/rows/query", fields);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
        return JsonDocument.Parse(body).RootElement;
    }
}
