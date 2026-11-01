using System.Collections;
using System.Globalization;
using System.Linq.Expressions;
using System.Reflection;
using DevExtreme.AspNet.Data;
using MockServer.Data;

namespace MockServer.Api;

/// <summary>
/// Список значений колонки приходит цепочкой <c>[[f,"=",a],"or",[f,"=",b],…]</c>: до 5 000
/// условий из окна «Выбрать показанные». DataSourceLoader компилирует её в цепочку
/// <c>OrElse</c> с <c>ToLower()</c> на каждом условии — тысячи сравнений на строку набора.
/// Такая цепочка на верхнем уровне фильтра или внутри верхней группы «and» снимается с
/// фильтра и накладывается на источник одним <c>HashSet.Contains</c>.
/// </summary>
public static class ValueListFilter
{
    /// <summary>Условий в фильтре после разбора; 5 000 значений и несколько колонок помещаются.</summary>
    public const int MaxOperands = 6000;

    private const string EqualsOp = "=";
    private const string Or = "or";
    private const string And = "and";
    private const string Not = "!";

    public static int CountOperands(IList? filter)
    {
        if (filter is null || filter.Count == 0)
            return 0;
        if (filter[0] is string head)
            return head == Not && filter.Count > 1 ? CountOperands(filter[1] as IList) : 1;
        var count = 0;
        foreach (var item in filter)
            count += CountOperands(item as IList);
        return count;
    }

    public static IQueryable<ProductionRecord> Apply(IQueryable<ProductionRecord> source, DataSourceLoadOptionsBase options)
    {
        if (options.Filter is not { } filter)
            return source;

        if (TryRewrite(filter, out var predicate))
        {
            options.Filter = null;
            return source.Where(predicate);
        }

        if (!IsGroup(filter, And))
            return source;

        var kept = new List<object>();
        foreach (var item in filter)
        {
            if (item is IList child && TryRewrite(child, out var childPredicate))
                source = source.Where(childPredicate);
            else if (item is IList)
                kept.Add(item);
        }
        if (kept.Count * 2 - 1 == filter.Count)
            return source;
        options.Filter = kept.Count switch
        {
            0 => null,
            1 => (IList)kept[0],
            _ => Join(kept, And),
        };
        return source;
    }

    private static bool TryRewrite(IList list, out Expression<Func<ProductionRecord, bool>> predicate)
    {
        predicate = null!;
        if (!IsGroup(list, Or))
            return false;

        string? field = null;
        var values = new List<object>();
        for (var i = 0; i < list.Count; i += 2)
        {
            if (list[i] is not IList { Count: 3 } leaf
                || leaf[0] is not string leafField
                || leaf[1] is not string op || op != EqualsOp
                || leaf[2] is null)
                return false;
            if (field is null)
                field = leafField;
            else if (field != leafField)
                return false;
            values.Add(leaf[2]!);
        }

        var property = typeof(ProductionRecord).GetProperty(field!, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
        if (property is null || !property.CanRead || !IsScalar(property.PropertyType))
            return false;

        try
        {
            predicate = (Expression<Func<ProductionRecord, bool>>)typeof(ValueListFilter)
                .GetMethod(nameof(Contains), BindingFlags.NonPublic | BindingFlags.Static)!
                .MakeGenericMethod(property.PropertyType)
                .Invoke(null, new object[] { property, values })!;
            return true;
        }
        catch (TargetInvocationException e) when (e.InnerException is FormatException or InvalidCastException or OverflowException)
        {
            return false;
        }
    }

    private static Expression<Func<ProductionRecord, bool>> Contains<T>(PropertyInfo property, List<object> values) where T : notnull
    {
        var comparer = typeof(T) == typeof(string)
            ? (IEqualityComparer<T>)StringComparer.OrdinalIgnoreCase
            : EqualityComparer<T>.Default;
        var set = new HashSet<T>(comparer);
        foreach (var value in values)
            set.Add((T)Convert.ChangeType(value, typeof(T), CultureInfo.InvariantCulture));

        var row = Expression.Parameter(typeof(ProductionRecord), "row");
        var contains = Expression.Call(Expression.Constant(set), nameof(HashSet<T>.Contains), null, Expression.Property(row, property));
        return Expression.Lambda<Func<ProductionRecord, bool>>(contains, row);
    }

    private static bool IsScalar(Type type) =>
        type == typeof(string) || type == typeof(int) || type == typeof(double) || type == typeof(DateTime);

    /// <summary>Группа вида <c>[cond, op, cond, op, cond]</c> с одним и тем же оператором.</summary>
    private static bool IsGroup(IList list, string op)
    {
        if (list.Count < 3 || list.Count % 2 == 0 || list[0] is not IList)
            return false;
        for (var i = 0; i < list.Count; i++)
        {
            var isOperator = i % 2 == 1;
            if (isOperator ? list[i] is not string s || !string.Equals(s, op, StringComparison.OrdinalIgnoreCase) : list[i] is not IList)
                return false;
        }
        return true;
    }

    private static IList Join(List<object> conditions, string op)
    {
        var group = new List<object>(conditions.Count * 2 - 1);
        foreach (var condition in conditions)
        {
            if (group.Count > 0) group.Add(op);
            group.Add(condition);
        }
        return group;
    }
}
